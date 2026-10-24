import {beforeAll, describe, expect, it} from "vitest";
import request from "supertest";

let app, db, computeSlots, runCompletionJob, seed, nowLocal, addMin;
const tokens = {};

beforeAll(async () => {
  process.env.DB_FILE = ":memory:";
  process.env.JWT_SECRET = "test-secret";
  process.env.NODE_ENV = "test";
  ({default: app} = await import("../src/app.js"));
  ({db} = await import("../src/db.js"));
  ({computeSlots} = await import("../src/avail.js"));
  ({runCompletionJob} = await import("../src/jobs.js"));
  ({seed} = await import("../src/seed.js"));
  ({nowLocal, addMin} = await import("../src/avail.js"));
  seed();
  tokens.client = await login("client@bookly.dev");
  tokens.owner = await login("owner@bookly.dev");
  tokens.owner2 = await login("owner2@bookly.dev");
});

const login = async email => {
  const response = await request(app).post("/api/auth/login").send({email, password: "Bookly2026!"});
  expect(response.status).toBe(200);
  return {token: response.body.data.accessToken, user: response.body.data.user};
};
const auth = token => ({Authorization: `Bearer ${token}`});
const nextWeekday = target => {
  const date = new Date(nowLocal().slice(0, 10) + "T12:00:00Z");
  const diff = (target - date.getUTCDay() + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
};
const seedContext = async () => {
  const business = (await request(app).get("/api/businesses/salon-elegance")).body.data;
  return {business, service: business.services[0], staff: business.staff[0]};
};

describe("computeSlots", () => {
  it("génère une journée simple avec un pas de 15 minutes", () => {
    const slots = computeSlots({
      date: "2026-11-02",
      duration: 60,
      staffList: [{id: 1, hours: [{weekday: 1, start: "09:00", end: "12:00"}], bookings: []}],
      now: "2026-11-01T08:00"
    });
    expect(slots[0]).toEqual({time: "09:00", staffIds: [1]});
    expect(slots.at(-1).time).toBe("11:00");
    expect(slots).toHaveLength(9);
  });

  it("respecte la pause déjeuner", () => {
    const slots = computeSlots({
      date: "2026-11-02",
      duration: 30,
      staffList: [{id: 1, hours: [{weekday: 1, start: "09:00", end: "12:00"}, {weekday: 1, start: "14:00", end: "18:00"}], bookings: []}],
      now: "2026-11-01T08:00"
    });
    expect(slots.some(slot => slot.time === "12:00")).toBe(false);
    expect(slots.some(slot => slot.time === "14:00")).toBe(true);
  });

  it("exclut les chevauchements avec une réservation", () => {
    const slots = computeSlots({
      date: "2026-11-02",
      duration: 60,
      staffList: [{id: 1, hours: [{weekday: 1, start: "09:00", end: "12:00"}], bookings: [{start: "2026-11-02T10:00", end: "2026-11-02T11:00"}]}],
      now: "2026-11-01T08:00"
    });
    expect(slots.some(slot => slot.time === "09:15")).toBe(false);
    expect(slots.some(slot => slot.time === "10:00")).toBe(false);
    expect(slots.some(slot => slot.time === "11:00")).toBe(true);
  });

  it("applique le préavis d'une heure", () => {
    const slots = computeSlots({
      date: "2026-11-02",
      duration: 30,
      staffList: [{id: 1, hours: [{weekday: 1, start: "09:00", end: "12:00"}], bookings: []}],
      now: "2026-11-02T10:00"
    });
    expect(slots.some(slot => slot.time === "10:30")).toBe(false);
    expect(slots.some(slot => slot.time === "11:00")).toBe(true);
  });

  it("supprime les créneaux pendant un congé", () => {
    const slots = computeSlots({
      date: "2026-11-02",
      duration: 30,
      staffList: [{id: 1, hours: [{weekday: 1, start: "09:00", end: "12:00"}], timeOff: [{from: "2026-11-02", to: "2026-11-03"}], bookings: []}],
      now: "2026-11-01T08:00"
    });
    expect(slots).toEqual([]);
  });

  it("ne propose rien si la durée ne rentre pas", () => {
    const slots = computeSlots({
      date: "2026-11-02",
      service: {duration_min: 240},
      staffList: [{id: 1, workingHours: [{weekday: 1, start: "09:00", end: "12:00"}], bookings: []}],
      now: "2026-11-01T08:00"
    });
    expect(slots).toEqual([]);
  });

  it("fusionne les créneaux de plusieurs membres", () => {
    const slots = computeSlots({
      date: "2026-11-02",
      duration: 30,
      staffList: [
        {id: 1, hours: [{weekday: 1, start: "09:00", end: "10:00"}], bookings: []},
        {id: 2, hours: [{weekday: 1, start: "09:00", end: "10:00"}], bookings: []}
      ],
      now: "2026-11-01T08:00"
    });
    expect(slots.find(slot => slot.time === "09:00").staffIds).toEqual([1, 2]);
  });
});

describe("API réservations", () => {
  it("empêche la double réservation simultanée", async () => {
    const {token} = tokens.client;
    const {business, service, staff} = await seedContext();
    const date = nextWeekday(1);
    const availability = await request(app).get(`/api/businesses/${business.id}/availability?serviceId=${service.id}&staffId=${staff.id}&date=${date}`);
    expect(availability.status).toBe(200);
    const time = availability.body.data[0].time;
    const payload = {businessId: business.id, serviceId: service.id, staffId: staff.id, startAt: `${date}T${time}`};
    const [first, second] = await Promise.all([
      request(app).post("/api/bookings").set(auth(token)).send(payload),
      request(app).post("/api/bookings").set(auth(token)).send(payload)
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });

  it("applique la règle d'annulation à 24 h", async () => {
    const {token, user} = tokens.client;
    const {business, service, staff} = await seedContext();
    const insert = db.prepare("INSERT INTO bookings(code,client_id,business_id,service_id,staff_id,start_at,end_at,status,price) VALUES(?,?,?,?,?,?,?,?,?)");
    const soon = addMin(nowLocal(), 120);
    const soonId = Number(insert.run("BK-TEST24", user.id, business.id, service.id, staff.id, soon, addMin(soon, 30), "confirmed", service.price).lastInsertRowid);
    const late = addMin(nowLocal(), 48 * 60);
    const lateId = Number(insert.run("BK-TEST48", user.id, business.id, service.id, staff.id, late, addMin(late, 30), "confirmed", service.price).lastInsertRowid);
    expect((await request(app).post(`/api/bookings/${soonId}/cancel`).set(auth(token))).status).toBe(400);
    expect((await request(app).post(`/api/bookings/${lateId}/cancel`).set(auth(token))).status).toBe(200);
  });

  it("n'accepte un avis qu'après une réservation terminée et une seule fois", async () => {
    const {token, user} = tokens.client;
    const {business, service, staff} = await seedContext();
    const insert = db.prepare("INSERT INTO bookings(code,client_id,business_id,service_id,staff_id,start_at,end_at,status,price) VALUES(?,?,?,?,?,?,?,?,?)");
    const past = addMin(nowLocal(), -180);
    const pendingId = Number(insert.run("BK-REVIEW1", user.id, business.id, service.id, staff.id, past, addMin(past, 30), "confirmed", service.price).lastInsertRowid);
    const doneId = Number(insert.run("BK-REVIEW2", user.id, business.id, service.id, staff.id, past, addMin(past, 30), "completed", service.price).lastInsertRowid);
    expect((await request(app).post(`/api/bookings/${pendingId}/review`).set(auth(token)).send({rating: 5, comment: "Super"})).status).toBe(400);
    expect((await request(app).post(`/api/bookings/${doneId}/review`).set(auth(token)).send({rating: 5, comment: "Super"})).status).toBe(201);
    expect((await request(app).post(`/api/bookings/${doneId}/review`).set(auth(token)).send({rating: 4, comment: "Encore"})).status).toBe(409);
  });

  it("protège les routes prestataire par le rôle", async () => {
    const {token} = tokens.client;
    expect((await request(app).get("/api/owner/services").set(auth(token))).status).toBe(403);
  });

  it("empêche un propriétaire de modifier les services d'un autre", async () => {
    const {token} = tokens.owner2;
    const {service} = await seedContext();
    const response = await request(app).patch(`/api/owner/services/${service.id}`).set(auth(token)).send({name: "Pirate", duration_min: 30, price: 1000});
    expect(response.status).toBe(404);
  });

  it("ajoute un congé qui retire les créneaux de l'agenda", async () => {
    const {token} = tokens.owner;
    const {business, service, staff} = await seedContext();
    const date = nextWeekday(2);
    const before = await request(app).get(`/api/businesses/${business.id}/availability?serviceId=${service.id}&staffId=${staff.id}&date=${date}`);
    expect(before.body.data.length).toBeGreaterThan(0);
    const added = await request(app).post(`/api/owner/staff/${staff.id}/time-off`).set(auth(token)).send({dateFrom: date, dateTo: date, reason: "Test"});
    expect(added.status).toBe(201);
    const after = await request(app).get(`/api/businesses/${business.id}/availability?serviceId=${service.id}&staffId=${staff.id}&date=${date}`);
    expect(after.body.data).toEqual([]);
    expect((await request(app).delete(`/api/owner/staff/${staff.id}/time-off/${added.body.data.id}`).set(auth(token))).status).toBe(200);
  });

  it("crée une réservation manuelle pour un client téléphonique", async () => {
    const {token} = tokens.owner;
    const {business, service, staff} = await seedContext();
    const date = nextWeekday(3);
    const availability = await request(app).get(`/api/businesses/${business.id}/availability?serviceId=${service.id}&staffId=${staff.id}&date=${date}`);
    expect(availability.body.data.length).toBeGreaterThan(0);
    const response = await request(app).post("/api/owner/bookings").set(auth(token)).send({
      serviceId: service.id,
      staffId: staff.id,
      startAt: `${date}T${availability.body.data[0].time}`,
      clientName: "Client Téléphone",
      clientPhone: "+229 01 99 88 77 66"
    });
    expect(response.status).toBe(201);
    expect(response.body.data.client).toBe("Client Téléphone");
  });

  it("passe les réservations terminées en completed via le job", async () => {
    const {user} = tokens.client;
    const {business, service, staff} = await seedContext();
    const start = addMin(nowLocal(), -180);
    const id = Number(db.prepare("INSERT INTO bookings(code,client_id,business_id,service_id,staff_id,start_at,end_at,status,price) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("BK-JOB", user.id, business.id, service.id, staff.id, start, addMin(start, 30), "confirmed", service.price).lastInsertRowid);
    runCompletionJob(nowLocal());
    expect(db.prepare("SELECT status FROM bookings WHERE id=?").get(id).status).toBe("completed");
  });
});

describe("Extras client", () => {
  it("gère les favoris et les notifications", async () => {
    const {token} = tokens.client;
    const {business} = await seedContext();
    expect((await request(app).post(`/api/favorites/${business.id}`).set(auth(token))).status).toBe(201);
    const favorites = await request(app).get("/api/favorites").set(auth(token));
    expect(favorites.body.data.some(item => item.id === business.id)).toBe(true);
    expect((await request(app).delete(`/api/favorites/${business.id}`).set(auth(token))).status).toBe(200);
    const notifications = await request(app).get("/api/notifications").set(auth(token));
    expect(notifications.body.data.length).toBeGreaterThan(0);
    expect((await request(app).post("/api/notifications/read-all").set(auth(token))).status).toBe(200);
  });

  it("permet au prestataire de répondre à un avis", async () => {
    const {token} = tokens.owner;
    const reviews = await request(app).get("/api/owner/reviews").set(auth(token));
    expect(reviews.body.data.length).toBeGreaterThan(0);
    const response = await request(app).post(`/api/owner/reviews/${reviews.body.data[0].id}/reply`).set(auth(token)).send({reply: "Merci pour votre retour."});
    expect(response.status).toBe(200);
  });
});
