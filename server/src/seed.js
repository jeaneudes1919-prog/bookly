import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {db} from "./db.js";
import {computeSlots, addMin, nowLocal} from "./avail.js";

const BUSINESSES = [
  ["Salon Élégance", "coiffure", "Cotonou", "#FF7A59", "Coiffure et soins capillaires pour femmes et hommes, dans une ambiance chaleureuse.", [["Coupe femme", 45, 8000], ["Coupe homme", 30, 4000], ["Brushing", 30, 5000], ["Coloration", 90, 20000], ["Tresses", 120, 15000]], ["Awa", "Mireille", "Dorcas", "Sylvain"]],
  ["Barber House", "coiffure", "Cotonou", "#0F3D3E", "Barbier et soins de la barbe, coupes modernes et classiques.", [["Coupe classique", 30, 3500], ["Barbe", 20, 2500], ["Coupe + barbe", 45, 5500], ["Dégradé", 40, 4500]], ["Kevin", "Ibrahim"]],
  ["Spa Zen Cotonou", "spa", "Cotonou", "#A7C4A0", "Massages et soins du corps pour un moment de pure détente.", [["Massage relaxant", 60, 18000], ["Massage aux pierres chaudes", 75, 25000], ["Gommage corps", 45, 15000], ["Soin du visage", 50, 16000], ["Rituel duo", 90, 32000]], ["Léa", "Hermine"]],
  ["Beauté d'Ébène", "beaute", "Porto-Novo", "#E8B04B", "Soins du visage, maquillage et épilation par des esthéticiennes diplômées.", [["Soin du visage", 60, 12000], ["Maquillage", 45, 10000], ["Épilation jambes", 40, 7000], ["Manucure", 45, 6000], ["Pose de cils", 60, 9000]], ["Josiane", "Prisca"]],
  ["Coach Fit Bénin", "coaching", "Abomey-Calavi", "#7B8CDE", "Coaching sportif personnalisé : remise en forme, perte de poids, préparation physique.", [["Séance découverte", 45, 5000], ["Séance individuelle", 60, 10000], ["Bilan forme", 30, 6000], ["Programme 4 semaines", 90, 35000]], ["Serge", "Chimène"]],
  ["Clinique Dentaire Sourire", "sante", "Cotonou", "#4FA37A", "Cabinet dentaire moderne : consultations, détartrage et soins esthétiques.", [["Consultation", 30, 10000], ["Détartrage", 45, 20000], ["Blanchiment", 60, 45000], ["Soin carie", 50, 18000]], ["Dr Amoussou", "Dr Tossou"]],
  ["Garage Auto Plus", "auto", "Parakou", "#E4572E", "Entretien et réparation automobile : vidange, freins, diagnostic électronique.", [["Vidange", 45, 25000], ["Diagnostic électronique", 60, 15000], ["Contrôle freins", 45, 12000], ["Révision complète", 120, 60000]], ["Basile", "Roméo"]],
  ["Studio Nails & Co", "beaute", "Cotonou", "#C9559A", "Pose d'ongles, nail art et soins des mains et des pieds.", [["Pose gel", 90, 15000], ["Nail art", 60, 10000], ["Pédicure", 50, 8000], ["Manucure russe", 75, 12000]], ["Nadège", "Sika"]]
];
const COMMENTS = [
  "Excellent accueil et résultat parfait, je recommande !",
  "Très professionnel, ponctuel et à l'écoute.",
  "Bon service, un peu d'attente mais ça valait le coup.",
  "Super expérience, je reviendrai sans hésiter.",
  "Prestation de qualité et prix raisonnable.",
  "Équipe sympathique et locaux très propres.",
  "Un moment de détente absolu, merci pour ce soin.",
  "Résultat naturel et exactement ce que je souhaitais."
];
const REPLIES = [
  "Merci beaucoup pour votre confiance, à très bientôt !",
  "Nous sommes ravis que la prestation vous ait plu.",
  "Merci pour ce retour, nous prenons note de votre remarque.",
  "Au plaisir de vous accueillir de nouveau chez nous."
];

export function seed() {
  db.exec(`
    DELETE FROM notifications; DELETE FROM favorites; DELETE FROM emails_outbox;
    DELETE FROM reviews; DELETE FROM bookings; DELETE FROM time_off;
    DELETE FROM working_hours; DELETE FROM staff_services; DELETE FROM staff;
    DELETE FROM services; DELETE FROM businesses; DELETE FROM refresh_tokens; DELETE FROM users;
  `);

  const hash = bcrypt.hashSync("Bookly2026!", 10);
  const insertUser = db.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)");
  const user = (name, email, role = "client") => Number(insertUser.run(name, email, "+229 01 97 00 00 00", hash, role).lastInsertRowid);

  user("Administrateur Bookly", "admin@bookly.dev", "admin");
  const clientNames = [
    ["Ama Kpossou", "client@bookly.dev"], ["Yves Hounkpè", "yves@bookly.dev"], ["Chantal Ahouansou", "chantal@bookly.dev"],
    ["Marcel Zinsou", "marcel@bookly.dev"], ["Rita Adjovi", "rita@bookly.dev"], ["Eric Sossou", "eric@bookly.dev"],
    ["Grâce Dossou", "grace@bookly.dev"], ["Benoît Agossou", "benoit@bookly.dev"], ["Clarisse Houngbédji", "clarisse@bookly.dev"],
    ["Djidjoho Tossou", "djidjoho@bookly.dev"], ["Estelle Kiki", "estelle@bookly.dev"], ["Fabrice Gnonlonfoun", "fabrice@bookly.dev"],
    ["Gisèle Aïssi", "gisele@bookly.dev"], ["Hervé Dangbénon", "herve@bookly.dev"], ["Inès Aholou", "ines@bookly.dev"]
  ];
  const clients = clientNames.map(([name, email]) => user(name, email));

  let seedState = 11;
  const rnd = n => {
    seedState = (seedState * 9301 + 49297) % 233280;
    return Math.floor(seedState / 233280 * n);
  };

  const insertBusiness = db.prepare("INSERT INTO businesses(owner_id,name,slug,category,description,address,city,phone,color,status) VALUES(?,?,?,?,?,?,?,?,?,?)");
  const insertService = db.prepare("INSERT INTO services(business_id,name,description,duration_min,price) VALUES(?,?,?,?,?)");
  const insertStaff = db.prepare("INSERT INTO staff(business_id,name,role,color) VALUES(?,?,?,?)");
  const insertStaffService = db.prepare("INSERT INTO staff_services(staff_id,service_id) VALUES(?,?)");
  const insertHours = db.prepare("INSERT INTO working_hours(staff_id,weekday,start_time,end_time) VALUES(?,?,?,?)");
  const insertBooking = db.prepare("INSERT INTO bookings(code,client_id,business_id,service_id,staff_id,start_at,end_at,status,price) VALUES(?,?,?,?,?,?,?,?,?)");
  const insertReview = db.prepare("INSERT INTO reviews(booking_id,client_id,business_id,rating,comment) VALUES(?,?,?,?,?)");
  const colors = ["#FF7A59", "#0F3D3E", "#7B8CDE", "#E8B04B"];
  const now = nowLocal();
  const businesses = [];

  BUSINESSES.forEach(([name, category, city, color, description, services, staff], index) => {
    const owner = user(`Propriétaire ${name}`, index === 0 ? "owner@bookly.dev" : `owner${index + 1}@bookly.dev`, "owner");
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
    const businessId = Number(insertBusiness.run(owner, name, slug, category, description, `Quartier ${city} centre`, city, `+229 01 21 00 00 0${index}`, color, "approved").lastInsertRowid);
    const serviceIds = services.map(([serviceName, duration, price]) => Number(insertService.run(businessId, serviceName, "", duration, price).lastInsertRowid));
    const staffIds = staff.map((staffName, staffIndex) => {
      const staffId = Number(insertStaff.run(businessId, staffName, "Professionnel", colors[staffIndex % colors.length]).lastInsertRowid);
      serviceIds.forEach(serviceId => insertStaffService.run(staffId, serviceId));
      for (let weekday = 1; weekday <= 6; weekday++) {
        if (weekday === 6 && staffIndex % 2) continue;
        insertHours.run(staffId, weekday, "08:00", "12:00");
        insertHours.run(staffId, weekday, "14:00", "18:00");
      }
      return staffId;
    });
    businesses.push({businessId, serviceIds, staffIds, services});
  });

  const pendingOwner = user("Propriétaire Atelier Zen", "owner9@bookly.dev", "owner");
  insertBusiness.run(pendingOwner, "Atelier Zen Yoga", "atelier-zen-yoga", "coaching", "Cours de yoga et méditation.", "Haie Vive", "Cotonou", "+229 01 21 00 00 99", "#6B9080", "pending");

  for (let i = 0; i < 180; i++) {
    const business = businesses[rnd(businesses.length)];
    const serviceIndex = rnd(business.serviceIds.length);
    const staffId = business.staffIds[rnd(business.staffIds.length)];
    const date = new Date(Date.now() + (rnd(60) - 45) * 864e5).toISOString().slice(0, 10);
    const hours = db.prepare("SELECT weekday,start_time start,end_time end FROM working_hours WHERE staff_id=?").all(staffId);
    const bookings = db.prepare("SELECT start_at start,end_at end FROM bookings WHERE staff_id=? AND substr(start_at,1,10)=?").all(staffId, date);
    const [serviceName, duration, price] = business.services[serviceIndex];
    const slots = computeSlots({date, duration, staffList: [{id: staffId, hours, bookings}], now: "2000-01-01T00:00"});
    if (!slots.length) continue;
    const start = date + "T" + slots[rnd(slots.length)].time;
    const past = start < now;
    const draw = rnd(100);
    const status = past ? (draw < 72 ? "completed" : draw < 88 ? "cancelled" : "no_show") : (draw < 82 ? "confirmed" : "pending");
    const code = "BK-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const bookingId = Number(insertBooking.run(code, clients[rnd(clients.length)], business.businessId, business.serviceIds[serviceIndex], staffId, start, addMin(start, duration), status, price).lastInsertRowid);
    if (status === "completed" && rnd(100) < 70) {
      const clientId = db.prepare("SELECT client_id FROM bookings WHERE id=?").get(bookingId).client_id;
      insertReview.run(bookingId, clientId, business.businessId, 3 + rnd(3), COMMENTS[rnd(COMMENTS.length)]);
    }
  }

  // Garantit un volume d'avis réaliste (60 minimum).
  const reviewCount = db.prepare("SELECT COUNT(*) n FROM reviews").get().n;
  if (reviewCount < 60) {
    const missing = db.prepare(`
      SELECT b.id,b.client_id,b.business_id FROM bookings b
      WHERE b.status='completed' AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.booking_id=b.id)
      LIMIT ?
    `).all(60 - reviewCount);
    missing.forEach((b, index) => insertReview.run(b.id, b.client_id, b.business_id, 4 + (index % 2), COMMENTS[index % COMMENTS.length]));
  }

  const reviews = db.prepare("SELECT id FROM reviews ORDER BY id LIMIT 14").all();
  reviews.forEach((review, index) => db.prepare("UPDATE reviews SET reply=? WHERE id=?").run(REPLIES[index % REPLIES.length], review.id));

  // Favoris, congés, notifications et boîte mail simulée pour les comptes de démonstration.
  businesses.slice(0, 4).forEach(b => db.prepare("INSERT OR IGNORE INTO favorites(user_id,business_id) VALUES(?,?)").run(clients[0], b.businessId));
  const offDate = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  db.prepare("INSERT INTO time_off(staff_id,date_from,date_to,reason) VALUES(?,?,?,?)").run(businesses[1].staffIds[0], offDate, offDate, "Formation barbier");
  db.prepare("INSERT INTO notifications(user_id,type,title,body) VALUES(?,?,?,?)").run(clients[0], "system", "Bienvenue sur Bookly", "Explorez les prestataires et réservez votre premier rendez-vous.");
  const next = db.prepare("SELECT code,start_at FROM bookings WHERE client_id=? AND status='confirmed' ORDER BY start_at LIMIT 1").get(clients[0]);
  if (next) db.prepare("INSERT INTO notifications(user_id,type,title,body) VALUES(?,?,?,?)").run(clients[0], "booking", "Réservation confirmée", `Votre rendez-vous ${next.code} est prévu le ${next.start_at.slice(0, 10)} à ${next.start_at.slice(11, 16)}.`);
  db.prepare("INSERT INTO emails_outbox(to_email,subject,body) VALUES(?,?,?)").run("client@bookly.dev", "Bienvenue chez Bookly", "Votre compte de démonstration est prêt. Mot de passe : Bookly2026!");

  for (const business of businesses) {
    const rating = db.prepare("SELECT AVG(rating) a,COUNT(*) n FROM reviews WHERE business_id=?").get(business.businessId);
    db.prepare("UPDATE businesses SET rating_avg=?,rating_count=? WHERE id=?").run(Math.round((rating.a || 0) * 10) / 10, rating.n, business.businessId);
  }
}
