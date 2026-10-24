import {Router} from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {z} from "zod";
import {db} from "./db.js";
import {auth, role} from "./auth.js";
import {HttpError, ah, parse} from "./util.js";
import {addMin, nowLocal} from "./avail.js";
import {bizCard, bookingOut, BK, slotsFor, needBiz} from "./api.js";

const r = Router();
const owner = role("owner");
const admin = role("admin");
const pageOf = req => {
  const page = Math.max(1, +req.query.page || 1);
  const limit = Math.min(100, Math.max(1, +req.query.limit || 20));
  return {page, limit, offset: (page - 1) * limit};
};
const staffOf = (req, id) => {
  const business = needBiz(req);
  const staff = db.prepare("SELECT * FROM staff WHERE id=? AND business_id=?").get(+id, business.id);
  if (!staff) throw new HttpError(404, "NOT_FOUND", "Membre d'équipe introuvable");
  return {business, staff};
};

// ---------- Public ----------
r.get("/businesses/:id/reviews", ah((req, res) => {
  const business = db.prepare("SELECT * FROM businesses WHERE id=? AND status='approved'").get(+req.params.id);
  if (!business) throw new HttpError(404, "NOT_FOUND", "Prestataire introuvable");
  const {page, limit, offset} = pageOf(req);
  const total = db.prepare("SELECT COUNT(*) n FROM reviews WHERE business_id=?").get(business.id).n;
  const rows = db.prepare(`
    SELECT r.id,r.rating,r.comment,r.reply,r.created_at,u.name client,b.code bookingCode
    FROM reviews r JOIN users u ON u.id=r.client_id JOIN bookings b ON b.id=r.booking_id
    WHERE r.business_id=? ORDER BY r.id DESC LIMIT ? OFFSET ?
  `).all(business.id, limit, offset);
  res.json({data: rows, meta: {page, limit, total}});
}));

r.get("/reviews/featured", ah((req, res) => {
  const rows = db.prepare(`
    SELECT r.id,r.rating,r.comment,r.reply,r.created_at,u.name client,b.name business,b.slug,b.color
    FROM reviews r
    JOIN users u ON u.id=r.client_id
    JOIN businesses b ON b.id=r.business_id
    WHERE b.status='approved' AND r.rating>=4
    ORDER BY r.id DESC LIMIT 6
  `).all();
  res.json({data: rows});
}));

// ---------- Client ----------
r.get("/bookings/:id(\\d+)", auth, ah((req, res) => {
  const booking = db.prepare(BK + " WHERE b.id=?").get(+req.params.id);
  if (!booking) throw new HttpError(404, "NOT_FOUND", "Réservation introuvable");
  if (req.user.role === "client" && booking.client_id !== req.user.id) throw new HttpError(403, "FORBIDDEN", "Accès refusé");
  if (req.user.role === "owner" && booking.business_id !== needBiz(req).id) throw new HttpError(403, "FORBIDDEN", "Accès refusé");
  res.json({data: bookingOut(booking)});
}));

r.get("/favorites", auth, ah((req, res) => {
  const rows = db.prepare(`
    SELECT b.* FROM favorites f JOIN businesses b ON b.id=f.business_id
    WHERE f.user_id=? AND b.status='approved' ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json({data: rows.map(bizCard)});
}));

r.post("/favorites/:businessId", auth, ah((req, res) => {
  const business = db.prepare("SELECT id FROM businesses WHERE id=? AND status='approved'").get(+req.params.businessId);
  if (!business) throw new HttpError(404, "NOT_FOUND", "Prestataire introuvable");
  db.prepare("INSERT OR IGNORE INTO favorites(user_id,business_id) VALUES(?,?)").run(req.user.id, business.id);
  res.status(201).json({data: {ok: true, favorite: true}});
}));

r.delete("/favorites/:businessId", auth, ah((req, res) => {
  db.prepare("DELETE FROM favorites WHERE user_id=? AND business_id=?").run(req.user.id, +req.params.businessId);
  res.json({data: {ok: true, favorite: false}});
}));

r.get("/notifications", auth, ah((req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.id);
  res.json({data: rows});
}));

r.post("/notifications/read-all", auth, ah((req, res) => {
  db.prepare("UPDATE notifications SET read=1 WHERE user_id=?").run(req.user.id);
  res.json({data: {ok: true}});
}));

r.patch("/notifications/:id/read", auth, ah((req, res) => {
  const result = db.prepare("UPDATE notifications SET read=1 WHERE id=? AND user_id=?").run(+req.params.id, req.user.id);
  if (!result.changes) throw new HttpError(404, "NOT_FOUND", "Notification introuvable");
  res.json({data: {ok: true}});
}));

// ---------- Prestataire ----------
r.get("/owner/reviews", auth, owner, ah((req, res) => {
  const business = needBiz(req);
  const rows = db.prepare(`
    SELECT r.id,r.rating,r.comment,r.reply,r.created_at,u.name client,b.code,b.start_at,s.name service
    FROM reviews r
    JOIN users u ON u.id=r.client_id
    JOIN bookings b ON b.id=r.booking_id
    JOIN services s ON s.id=b.service_id
    WHERE r.business_id=? ORDER BY r.id DESC
  `).all(business.id);
  res.json({data: rows});
}));

r.post("/owner/reviews/:id/reply", auth, owner, ah((req, res) => {
  const business = needBiz(req);
  const d = parse(z.object({reply: z.string().trim().min(1, "Réponse requise").max(500)}), req.body);
  const review = db.prepare("SELECT id FROM reviews WHERE id=? AND business_id=?").get(+req.params.id, business.id);
  if (!review) throw new HttpError(404, "NOT_FOUND", "Avis introuvable");
  db.prepare("UPDATE reviews SET reply=? WHERE id=?").run(d.reply, review.id);
  res.json({data: {ok: true}});
}));

r.put("/owner/staff/:id/services", auth, owner, ah((req, res) => {
  const {business, staff} = staffOf(req, req.params.id);
  const d = parse(z.object({serviceIds: z.array(z.number().int())}), req.body);
  db.transaction(() => {
    db.prepare("DELETE FROM staff_services WHERE staff_id=?").run(staff.id);
    for (const id of d.serviceIds) {
      if (db.prepare("SELECT 1 FROM services WHERE id=? AND business_id=?").get(id, business.id)) {
        db.prepare("INSERT INTO staff_services(staff_id,service_id) VALUES(?,?)").run(staff.id, id);
      }
    }
  })();
  res.json({data: {ok: true}});
}));

r.put("/owner/staff/:id/working-hours", auth, owner, ah((req, res) => {
  const {staff} = staffOf(req, req.params.id);
  const d = parse(z.object({
    hours: z.array(z.object({
      weekday: z.number().int().min(0).max(6),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/)
    }))
  }), req.body);
  if (d.hours.some(h => h.start >= h.end)) throw new HttpError(400, "VALIDATION_ERROR", "L'heure de fin doit être après l'heure de début");
  db.transaction(() => {
    db.prepare("DELETE FROM working_hours WHERE staff_id=?").run(staff.id);
    for (const h of d.hours) db.prepare("INSERT INTO working_hours(staff_id,weekday,start_time,end_time) VALUES(?,?,?,?)").run(staff.id, h.weekday, h.start, h.end);
  })();
  res.json({data: {ok: true}});
}));

r.get("/owner/staff/:id/time-off", auth, owner, ah((req, res) => {
  const {staff} = staffOf(req, req.params.id);
  res.json({data: db.prepare("SELECT * FROM time_off WHERE staff_id=? ORDER BY date_from").all(staff.id)});
}));

r.post("/owner/staff/:id/time-off", auth, owner, ah((req, res) => {
  const {staff} = staffOf(req, req.params.id);
  const d = parse(z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    reason: z.string().trim().max(120).optional()
  }), req.body);
  if (d.dateFrom > d.dateTo) throw new HttpError(400, "VALIDATION_ERROR", "La date de fin doit être après la date de début");
  const id = db.prepare("INSERT INTO time_off(staff_id,date_from,date_to,reason) VALUES(?,?,?,?)")
    .run(staff.id, d.dateFrom, d.dateTo, d.reason || "").lastInsertRowid;
  res.status(201).json({data: {id}});
}));

r.delete("/owner/staff/:id/time-off/:offId", auth, owner, ah((req, res) => {
  const {staff} = staffOf(req, req.params.id);
  const result = db.prepare("DELETE FROM time_off WHERE id=? AND staff_id=?").run(+req.params.offId, staff.id);
  if (!result.changes) throw new HttpError(404, "NOT_FOUND", "Congé introuvable");
  res.json({data: {ok: true}});
}));

r.post("/owner/bookings", auth, owner, ah((req, res) => {
  const business = needBiz(req);
  const d = parse(z.object({
    serviceId: z.number().int(),
    staffId: z.number().int().nullable().optional(),
    startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Date invalide"),
    clientName: z.string().trim().min(2, "Nom du client requis").max(60),
    clientPhone: z.string().trim().min(6, "Téléphone requis").max(20),
    notes: z.string().max(300).optional()
  }), req.body);

  let client = db.prepare("SELECT * FROM users WHERE phone=? AND role='client'").get(d.clientPhone);
  if (!client) {
    const email = `manuel-${crypto.randomBytes(4).toString("hex")}@bookly.local`;
    const id = db.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)")
      .run(d.clientName, email, d.clientPhone, bcrypt.hashSync(crypto.randomBytes(12).toString("hex"), 10), "client").lastInsertRowid;
    client = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  }

  const id = db.transaction(() => {
    const {svc, list, slots} = slotsFor(business.id, d.serviceId, d.startAt.slice(0, 10), d.staffId || null);
    const slot = slots.find(s => s.time === d.startAt.slice(11, 16));
    if (!slot) throw new HttpError(409, "CONFLICT", "Ce créneau vient d'être pris. Choisissez-en un autre.");
    const staffId = d.staffId || slot.staffIds.map(sid => ({id: sid, n: list.find(x => x.id === sid).bookings.length})).sort((a, b) => a.n - b.n)[0].id;
    const code = "BK-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const bookingId = db.prepare("INSERT INTO bookings(code,client_id,business_id,service_id,staff_id,start_at,end_at,status,price,notes) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(code, client.id, business.id, d.serviceId, staffId, d.startAt, addMin(d.startAt, svc.duration_min), "confirmed", svc.price, d.notes || "").lastInsertRowid;
    db.prepare("INSERT INTO notifications(user_id,type,title,body) VALUES(?,?,?,?)")
      .run(client.id, "booking", "Réservation confirmée", `Votre réservation ${code} chez ${business.name} est confirmée le ${d.startAt.slice(0, 10)} à ${d.startAt.slice(11, 16)}.`);
    return bookingId;
  })();

  res.status(201).json({data: bookingOut(db.prepare(BK + " WHERE b.id=?").get(id))});
}));

// ---------- Admin ----------
r.get("/admin/users", auth, admin, ah((req, res) => {
  const rows = db.prepare("SELECT id,name,email,phone,role,blocked,created_at FROM users ORDER BY id").all();
  res.json({data: rows});
}));

r.patch("/admin/users/:id/role-or-block", auth, admin, ah((req, res) => {
  const id = +req.params.id;
  const d = parse(z.object({
    role: z.enum(["client", "owner", "admin"]).optional(),
    blocked: z.boolean().optional()
  }), req.body);
  if (id === req.user.id && (d.role && d.role !== "admin" || d.blocked)) throw new HttpError(400, "VALIDATION_ERROR", "Vous ne pouvez pas modifier votre propre accès");
  const user = db.prepare("SELECT id FROM users WHERE id=?").get(id);
  if (!user) throw new HttpError(404, "NOT_FOUND", "Utilisateur introuvable");
  db.prepare("UPDATE users SET role=COALESCE(?,role),blocked=COALESCE(?,blocked) WHERE id=?")
    .run(d.role ?? null, d.blocked === undefined ? null : +d.blocked, id);
  res.json({data: db.prepare("SELECT id,name,email,phone,role,blocked,created_at FROM users WHERE id=?").get(id)});
}));

export default r;
