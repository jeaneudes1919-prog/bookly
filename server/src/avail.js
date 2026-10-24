const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const fmt = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

export const nowLocal = () => new Date(Date.now() + 36e5).toISOString().slice(0, 16);
export const addMin = (s, m) => {
  const d = new Date(s + ":00Z");
  d.setUTCMinutes(d.getUTCMinutes() + m);
  return d.toISOString().slice(0, 16);
};
export const hoursBetween = (a, b) => (Date.parse(a + ":00Z") - Date.parse(b + ":00Z")) / 36e5;

// Fonction pure : calcule les créneaux disponibles d'un jour (heure locale du Bénin, UTC+1).
// Accepte les clés historiques (duration, hours, bookings) et celles du cahier des charges
// (service.duration_min, workingHours, timeOff).
export function computeSlots({date, duration, service, staffList, now, step = 15, stepMin = 15, lead = 60}) {
  const dur = duration ?? service?.duration_min;
  const interval = stepMin || step;
  if (!date || !dur || !Array.isArray(staffList)) return [];

  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const currentDay = now.slice(0, 10);
  const limit = currentDay === date ? toMin(now.slice(11, 16)) + lead : currentDay > date ? Infinity : -1;
  const map = new Map();

  for (const staff of staffList) {
    const off = staff.timeOff || staff.timeOffs || [];
    const isOff = off.some(item => {
      const from = item.from || item.date_from;
      const to = item.to || item.date_to || from;
      return date >= from && date <= to;
    });
    if (isOff) continue;

    const hours = staff.hours || staff.workingHours || [];
    const busy = (staff.bookings || [])
      .filter(b => !b.status || ["pending", "confirmed"].includes(b.status))
      .filter(b => (b.start || b.start_at).slice(0, 10) === date)
      .map(b => {
        const start = (b.start || b.start_at).slice(11, 16);
        const end = (b.end || b.end_at).slice(11, 16);
        return [toMin(start), toMin(end)];
      });

    for (const h of hours.filter(h => h.weekday === weekday)) {
      const a = toMin(h.start || h.start_time);
      const z = toMin(h.end || h.end_time);
      for (let t = a; t + dur <= z; t += interval) {
        if (t < limit) continue;
        if (busy.some(([x, y]) => t < y && t + dur > x)) continue;
        const key = fmt(t);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(staff.id);
      }
    }
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, staffIds]) => ({time, staffIds}));
}
