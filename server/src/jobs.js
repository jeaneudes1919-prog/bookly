import cron from "node-cron";
import {db} from "./db.js";
import {addMin, nowLocal} from "./avail.js";

export function runCompletionJob(now = nowLocal()) {
  return db.prepare("UPDATE bookings SET status='completed' WHERE status='confirmed' AND end_at<?").run(now).changes;
}

export function runReminderJob(now = nowLocal()) {
  const rows = db.prepare(`
    SELECT b.id, b.start_at, b.code, u.id client_id, u.email, u.name client_name,
           s.name service_name, bz.name business_name
    FROM bookings b
    JOIN users u ON u.id=b.client_id
    JOIN services s ON s.id=b.service_id
    JOIN businesses bz ON bz.id=b.business_id
    WHERE b.status='confirmed' AND b.reminded=0 AND b.start_at>=? AND b.start_at<=?
  `).all(now, addMin(now, 24 * 60));

  const notify = db.prepare("INSERT INTO notifications(user_id,type,title,body) VALUES(?,?,?,?)");
  const mail = db.prepare("INSERT INTO emails_outbox(to_email,subject,body) VALUES(?,?,?)");
  const mark = db.prepare("UPDATE bookings SET reminded=1 WHERE id=?");

  db.transaction(() => {
    for (const row of rows) {
      const body = `Rappel : ${row.service_name} chez ${row.business_name} le ${row.start_at.slice(0, 10)} à ${row.start_at.slice(11, 16)}. Code ${row.code}.`;
      notify.run(row.client_id, "reminder", "Rappel de rendez-vous", body);
      mail.run(row.email, "Votre rendez-vous Bookly approche", body);
      mark.run(row.id);
    }
  })();
  return rows.length;
}

export function startJobs() {
  const completion = cron.schedule("* * * * *", () => runCompletionJob());
  const reminders = cron.schedule("0 * * * *", () => runReminderJob());
  return {completion, reminders};
}
