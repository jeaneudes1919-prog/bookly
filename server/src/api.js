import {Router} from "express";import crypto from "node:crypto";import {z} from "zod";
import {db} from "./db.js";import {auth,role} from "./auth.js";import {HttpError,ah,parse} from "./util.js";import {computeSlots,nowLocal,addMin,hoursBetween} from "./avail.js";
const r=Router();
const CATS=["coiffure","beaute","spa","coaching","sante","auto","autre"];
const slug=n=>n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export const bizCard=b=>({id:b.id,slug:b.slug,name:b.name,category:b.category,city:b.city,color:b.color,description:b.description,rating:b.rating_avg,ratingCount:b.rating_count,
fromPrice:db.prepare("SELECT MIN(price) p FROM services WHERE business_id=? AND active=1").get(b.id).p,servicesCount:db.prepare("SELECT COUNT(*) n FROM services WHERE business_id=? AND active=1").get(b.id).n});
export function slotsFor(bizId,serviceId,date,staffId){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new HttpError(400,"VALIDATION_ERROR","Date invalide");
const svc=db.prepare("SELECT * FROM services WHERE id=? AND business_id=? AND active=1").get(serviceId,bizId);if(!svc)throw new HttpError(404,"NOT_FOUND","Service introuvable");
let staff=db.prepare("SELECT s.* FROM staff s JOIN staff_services ss ON ss.staff_id=s.id WHERE s.business_id=? AND s.active=1 AND ss.service_id=?").all(bizId,serviceId);if(staffId)staff=staff.filter(s=>s.id===staffId);
const list=staff.map(s=>({id:s.id,name:s.name,hours:db.prepare("SELECT weekday,start_time,end_time FROM working_hours WHERE staff_id=?").all(s.id).map(h=>({weekday:h.weekday,start:h.start_time,end:h.end_time})),
timeOff:db.prepare("SELECT date_from,date_to,reason FROM time_off WHERE staff_id=?").all(s.id),
bookings:db.prepare("SELECT start_at start,end_at end FROM bookings WHERE staff_id=? AND substr(start_at,1,10)=? AND status IN ('pending','confirmed')").all(s.id,date)}));
return{svc,list,slots:computeSlots({date,duration:svc.duration_min,staffList:list,now:nowLocal()})}}
export const bookingOut=b=>({id:b.id,code:b.code,startAt:b.start_at,endAt:b.end_at,status:b.status,price:b.price,notes:b.notes,service:b.sname,staff:b.stname,staffColor:b.stcolor,client:b.cname,clientPhone:b.cphone,business:{id:b.business_id,name:b.bname,slug:b.bslug,color:b.bcolor},reviewed:!!b.rv,duration:b.dur});
export const BK=`SELECT b.*,s.name sname,s.duration_min dur,st.name stname,st.color stcolor,u.name cname,u.phone cphone,bz.name bname,bz.slug bslug,bz.color bcolor,(SELECT 1 FROM reviews r WHERE r.booking_id=b.id) rv FROM bookings b JOIN services s ON s.id=b.service_id JOIN staff st ON st.id=b.staff_id JOIN users u ON u.id=b.client_id JOIN businesses bz ON bz.id=b.business_id`;
function rate(bizId){const x=db.prepare("SELECT AVG(rating) a,COUNT(*) n FROM reviews WHERE business_id=?").get(bizId);db.prepare("UPDATE businesses SET rating_avg=?,rating_count=? WHERE id=?").run(Math.round((x.a||0)*10)/10,x.n,bizId)}
// ---------- Public ----------
r.get("/meta",ah((q,res)=>res.json({data:{categories:CATS,cities:db.prepare("SELECT DISTINCT city FROM businesses WHERE status='approved' ORDER BY city").all().map(x=>x.city)}})));
r.get("/businesses",ah((req,res)=>{const {category,city,q,minRating,maxPrice,sort}=req.query;const w=["status='approved'"],p=[];
if(category){w.push("category=?");p.push(category)}if(city){w.push("city=?");p.push(city)}if(q){w.push("(name LIKE ? OR description LIKE ? OR EXISTS(SELECT 1 FROM services sx WHERE sx.business_id=businesses.id AND sx.name LIKE ?))");p.push(`%${q}%`,`%${q}%`,`%${q}%`)}if(+minRating){w.push("rating_avg>=?");p.push(+minRating)}if(+maxPrice){w.push("EXISTS(SELECT 1 FROM services sp WHERE sp.business_id=businesses.id AND sp.active=1 AND sp.price<=?)");p.push(+maxPrice)}
const page=Math.max(1,+req.query.page||1),limit=Math.min(100,Math.max(1,+req.query.limit||20)),offset=(page-1)*limit;
const o=sort==="new"?"id DESC":sort==="price"?"(SELECT MIN(price) FROM services s WHERE s.business_id=businesses.id AND s.active=1) ASC":"rating_avg DESC,rating_count DESC";
const total=db.prepare(`SELECT COUNT(*) n FROM businesses WHERE ${w.join(" AND ")}`).get(...p).n;
res.json({data:db.prepare(`SELECT * FROM businesses WHERE ${w.join(" AND ")} ORDER BY ${o} LIMIT ? OFFSET ?`).all(...p,limit,offset).map(bizCard),meta:{page,limit,total}})}));
r.get("/businesses/:slug",ah((req,res)=>{const b=db.prepare("SELECT * FROM businesses WHERE slug=? AND status='approved'").get(req.params.slug);if(!b)throw new HttpError(404,"NOT_FOUND","Prestataire introuvable");
const staff=db.prepare("SELECT * FROM staff WHERE business_id=? AND active=1").all(b.id).map(s=>({id:s.id,name:s.name,role:s.role,color:s.color,serviceIds:db.prepare("SELECT service_id FROM staff_services WHERE staff_id=?").all(s.id).map(x=>x.service_id),hours:db.prepare("SELECT weekday,start_time,end_time FROM working_hours WHERE staff_id=? ORDER BY weekday,start_time").all(s.id)}));
res.json({data:{...bizCard(b),address:b.address,phone:b.phone,services:db.prepare("SELECT id,name,description,duration_min,price FROM services WHERE business_id=? AND active=1").all(b.id),staff,
reviews:db.prepare("SELECT r.rating,r.comment,r.reply,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.client_id WHERE r.business_id=? ORDER BY r.id DESC LIMIT 6").all(b.id)}})}));
r.get("/businesses/:id/availability",ah((req,res)=>{const {slots}=slotsFor(+req.params.id,+req.query.serviceId,String(req.query.date),req.query.staffId?+req.query.staffId:null);res.json({data:slots})}));
r.use(auth);
// ---------- Client ----------
r.post("/bookings",ah((req,res)=>{const d=parse(z.object({businessId:z.number().int(),serviceId:z.number().int(),staffId:z.number().int().nullable().optional(),startAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,"Date invalide"),notes:z.string().max(300).optional()}),req.body);
const biz=db.prepare("SELECT * FROM businesses WHERE id=? AND status='approved'").get(d.businessId);if(!biz)throw new HttpError(404,"NOT_FOUND","Prestataire introuvable");
const out=db.transaction(()=>{const {svc,list,slots}=slotsFor(d.businessId,d.serviceId,d.startAt.slice(0,10),d.staffId||null);const slot=slots.find(s=>s.time===d.startAt.slice(11,16));
if(!slot)throw new HttpError(409,"CONFLICT","Ce créneau vient d'être pris. Choisissez-en un autre.");
const sid=d.staffId||slot.staffIds.map(id=>({id,n:list.find(x=>x.id===id).bookings.length})).sort((a,b)=>a.n-b.n)[0].id;
const code="BK-"+crypto.randomBytes(3).toString("hex").toUpperCase();
const id=db.prepare("INSERT INTO bookings(code,client_id,business_id,service_id,staff_id,start_at,end_at,status,price,notes) VALUES(?,?,?,?,?,?,?,?,?,?)").run(code,req.user.id,d.businessId,d.serviceId,sid,d.startAt,addMin(d.startAt,svc.duration_min),"confirmed",svc.price,d.notes||"").lastInsertRowid;return id})();
res.status(201).json({data:bookingOut(db.prepare(BK+" WHERE b.id=?").get(out))})}));
r.get("/bookings/mine",ah((req,res)=>res.json({data:db.prepare(BK+" WHERE b.client_id=? ORDER BY b.start_at DESC").all(req.user.id).map(bookingOut)})));
r.post("/bookings/:id/cancel",ah((req,res)=>{const b=db.prepare("SELECT * FROM bookings WHERE id=? AND client_id=?").get(+req.params.id,req.user.id);if(!b)throw new HttpError(404,"NOT_FOUND","Réservation introuvable");
if(!["pending","confirmed"].includes(b.status))throw new HttpError(400,"VALIDATION_ERROR","Cette réservation ne peut plus être annulée");
if(hoursBetween(b.start_at,nowLocal())<24)throw new HttpError(400,"VALIDATION_ERROR","Annulation gratuite possible jusqu'à 24 h avant le rendez-vous");
db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);res.json({data:{ok:true}})}));
r.post("/bookings/:id/review",ah((req,res)=>{const d=parse(z.object({rating:z.number().int().min(1,"Note de 1 à 5").max(5,"Note de 1 à 5"),comment:z.string().trim().max(500).optional()}),req.body);
const b=db.prepare("SELECT * FROM bookings WHERE id=? AND client_id=?").get(+req.params.id,req.user.id);if(!b)throw new HttpError(404,"NOT_FOUND","Réservation introuvable");
if(b.status!=="completed")throw new HttpError(400,"VALIDATION_ERROR","Vous pourrez donner votre avis après le rendez-vous");
if(db.prepare("SELECT 1 FROM reviews WHERE booking_id=?").get(b.id))throw new HttpError(409,"CONFLICT","Avis déjà envoyé");
db.prepare("INSERT INTO reviews(booking_id,client_id,business_id,rating,comment) VALUES(?,?,?,?,?)").run(b.id,req.user.id,b.business_id,d.rating,d.comment||"");rate(b.business_id);res.status(201).json({data:{ok:true}})}));
// ---------- Prestataire ----------
const own=role("owner");export const mine=req=>db.prepare("SELECT * FROM businesses WHERE owner_id=?").get(req.user.id);
export const needBiz=req=>{const b=mine(req);if(!b)throw new HttpError(404,"NOT_FOUND","Créez d'abord votre entreprise");return b};
const bizSchema=z.object({name:z.string().trim().min(2,"Nom trop court").max(60),category:z.enum(CATS),description:z.string().max(500).optional(),address:z.string().max(120).optional(),city:z.string().trim().min(2,"Ville requise").max(40),phone:z.string().max(20).optional()});
r.get("/owner/business",own,ah((req,res)=>res.json({data:mine(req)||null})));
r.post("/owner/business",own,ah((req,res)=>{if(mine(req))throw new HttpError(409,"CONFLICT","Vous avez déjà une entreprise");const d=parse(bizSchema,req.body);
let s=slug(d.name);if(db.prepare("SELECT 1 FROM businesses WHERE slug=?").get(s))s+="-"+crypto.randomBytes(2).toString("hex");
const colors=["#FF7A59","#0F3D3E","#A7C4A0","#E8B04B","#7B8CDE"];
const id=db.prepare("INSERT INTO businesses(owner_id,name,slug,category,description,address,city,phone,color) VALUES(?,?,?,?,?,?,?,?,?)").run(req.user.id,d.name,s,d.category,d.description||"",d.address||"",d.city,d.phone||"",colors[Math.floor(Math.random()*5)]).lastInsertRowid;
res.status(201).json({data:db.prepare("SELECT * FROM businesses WHERE id=?").get(id)})}));
r.patch("/owner/business",own,ah((req,res)=>{const b=needBiz(req);const d=parse(bizSchema,req.body);
db.prepare("UPDATE businesses SET name=?,category=?,description=?,address=?,city=?,phone=? WHERE id=?").run(d.name,d.category,d.description||"",d.address||"",d.city,d.phone||"",b.id);res.json({data:db.prepare("SELECT * FROM businesses WHERE id=?").get(b.id)})}));
const svcSchema=z.object({name:z.string().trim().min(2,"Nom requis").max(60),description:z.string().max(200).optional(),duration_min:z.number().int().min(10,"Durée minimale : 10 min").max(480),price:z.number().int().min(0,"Prix invalide")});
r.get("/owner/services",own,ah((req,res)=>res.json({data:db.prepare("SELECT * FROM services WHERE business_id=? AND active=1").all(needBiz(req).id)})));
r.post("/owner/services",own,ah((req,res)=>{const b=needBiz(req);const d=parse(svcSchema,req.body);const id=db.prepare("INSERT INTO services(business_id,name,description,duration_min,price) VALUES(?,?,?,?,?)").run(b.id,d.name,d.description||"",d.duration_min,d.price).lastInsertRowid;res.status(201).json({data:{id}})}));
r.patch("/owner/services/:id",own,ah((req,res)=>{const b=needBiz(req);const d=parse(svcSchema,req.body);const x=db.prepare("UPDATE services SET name=?,description=?,duration_min=?,price=? WHERE id=? AND business_id=?").run(d.name,d.description||"",d.duration_min,d.price,+req.params.id,b.id);if(!x.changes)throw new HttpError(404,"NOT_FOUND","Service introuvable");res.json({data:{ok:true}})}));
r.delete("/owner/services/:id",own,ah((req,res)=>{const b=needBiz(req);db.prepare("UPDATE services SET active=0 WHERE id=? AND business_id=?").run(+req.params.id,b.id);res.json({data:{ok:true}})}));
const staffOut=s=>({id:s.id,name:s.name,role:s.role,color:s.color,serviceIds:db.prepare("SELECT service_id FROM staff_services WHERE staff_id=?").all(s.id).map(x=>x.service_id),hours:db.prepare("SELECT weekday,start_time,end_time FROM working_hours WHERE staff_id=? ORDER BY weekday,start_time").all(s.id)});
r.get("/owner/staff",own,ah((req,res)=>res.json({data:db.prepare("SELECT * FROM staff WHERE business_id=? AND active=1").all(needBiz(req).id).map(staffOut)})));
r.post("/owner/staff",own,ah((req,res)=>{const b=needBiz(req);const d=parse(z.object({name:z.string().trim().min(2,"Nom requis").max(40),role:z.string().max(40).optional()}),req.body);
const colors=["#FF7A59","#0F3D3E","#7B8CDE","#E8B04B","#4FA37A"];const n=db.prepare("SELECT COUNT(*) n FROM staff WHERE business_id=?").get(b.id).n;
const id=db.prepare("INSERT INTO staff(business_id,name,role,color) VALUES(?,?,?,?)").run(b.id,d.name,d.role||"",colors[n%5]).lastInsertRowid;res.status(201).json({data:{id}})}));
r.put("/owner/staff/:id",own,ah((req,res)=>{const b=needBiz(req);const s=db.prepare("SELECT * FROM staff WHERE id=? AND business_id=?").get(+req.params.id,b.id);if(!s)throw new HttpError(404,"NOT_FOUND","Membre introuvable");
const d=parse(z.object({name:z.string().trim().min(2).max(40),role:z.string().max(40).optional(),serviceIds:z.array(z.number().int()),hours:z.array(z.object({weekday:z.number().int().min(0).max(6),start:z.string().regex(/^\d{2}:\d{2}$/),end:z.string().regex(/^\d{2}:\d{2}$/)}))}),req.body);
if(d.hours.some(h=>h.start>=h.end))throw new HttpError(400,"VALIDATION_ERROR","L'heure de fin doit être après l'heure de début");
db.transaction(()=>{db.prepare("UPDATE staff SET name=?,role=? WHERE id=?").run(d.name,d.role||"",s.id);db.prepare("DELETE FROM staff_services WHERE staff_id=?").run(s.id);
for(const id of d.serviceIds)if(db.prepare("SELECT 1 FROM services WHERE id=? AND business_id=?").get(id,b.id))db.prepare("INSERT INTO staff_services VALUES(?,?)").run(s.id,id);
db.prepare("DELETE FROM working_hours WHERE staff_id=?").run(s.id);for(const h of d.hours)db.prepare("INSERT INTO working_hours(staff_id,weekday,start_time,end_time) VALUES(?,?,?,?)").run(s.id,h.weekday,h.start,h.end)})();res.json({data:{ok:true}})}));
r.delete("/owner/staff/:id",own,ah((req,res)=>{const b=needBiz(req);db.prepare("UPDATE staff SET active=0 WHERE id=? AND business_id=?").run(+req.params.id,b.id);res.json({data:{ok:true}})}));
r.get("/owner/bookings",own,ah((req,res)=>{const b=needBiz(req);const w=["b.business_id=?"],p=[b.id];const {from,to,status,staffId}=req.query;
if(from){w.push("substr(b.start_at,1,10)>=?");p.push(from)}if(to){w.push("substr(b.start_at,1,10)<=?");p.push(to)}if(status){w.push("b.status=?");p.push(status)}if(staffId){w.push("b.staff_id=?");p.push(+staffId)}
res.json({data:db.prepare(`${BK} WHERE ${w.join(" AND ")} ORDER BY b.start_at DESC LIMIT 300`).all(...p).map(bookingOut)})}));
r.patch("/owner/bookings/:id/status",own,ah((req,res)=>{const b=needBiz(req);const d=parse(z.object({status:z.enum(["confirmed","completed","no_show","cancelled"])}),req.body);
const x=db.prepare("SELECT * FROM bookings WHERE id=? AND business_id=?").get(+req.params.id,b.id);if(!x)throw new HttpError(404,"NOT_FOUND","Réservation introuvable");
if(!["pending","confirmed"].includes(x.status))throw new HttpError(400,"VALIDATION_ERROR","Statut déjà final");
if(d.status==="cancelled"){db.prepare("UPDATE bookings SET status=?,cancelled_by='owner' WHERE id=?").run(d.status,x.id);db.prepare("INSERT INTO notifications(user_id,type,title,body) VALUES(?,?,?,?)").run(x.client_id,"booking","Réservation annulée",`Votre réservation ${x.code} chez ${b.name} a été annulée par le prestataire.`)}
else db.prepare("UPDATE bookings SET status=? WHERE id=?").run(d.status,x.id);
res.json({data:{ok:true}})}));
r.get("/owner/stats",own,ah((req,res)=>{const b=needBiz(req);const from=new Date(Date.now()-29*864e5).toISOString().slice(0,10);
const rows=db.prepare("SELECT substr(start_at,1,10) d,status,price FROM bookings WHERE business_id=? AND substr(start_at,1,10)>=?").all(b.id,from);
const days=Array.from({length:30},(_,i)=>new Date(Date.now()-(29-i)*864e5).toISOString().slice(0,10));const rev=Object.fromEntries(days.map(d=>[d,0]));
rows.filter(x=>x.status==="completed").forEach(x=>{if(x.d in rev)rev[x.d]+=x.price});const total=rows.length;const cnt=s=>rows.filter(x=>x.status===s).length;
const oneTimers=db.prepare("SELECT COUNT(*) n FROM (SELECT client_id FROM bookings WHERE business_id=? GROUP BY client_id HAVING COUNT(*)=1)").get(b.id).n;
const clientsCount=db.prepare("SELECT COUNT(DISTINCT client_id) n FROM bookings WHERE business_id=?").get(b.id).n;
res.json({data:{revenue:days.map(d=>({date:d,value:rev[d]})),revenueTotal:Object.values(rev).reduce((a,c)=>a+c,0),bookings:total,cancelRate:total?Math.round(100*cnt("cancelled")/total):0,noShowRate:total?Math.round(100*cnt("no_show")/total):0,
upcoming:db.prepare("SELECT COUNT(*) n FROM bookings WHERE business_id=? AND status IN ('pending','confirmed') AND start_at>=?").get(b.id,nowLocal()).n,
topServices:db.prepare("SELECT s.name,COUNT(*) n FROM bookings k JOIN services s ON s.id=k.service_id WHERE k.business_id=? AND k.status!='cancelled' GROUP BY s.id ORDER BY n DESC LIMIT 5").all(b.id),
newClients:oneTimers,recurringClients:Math.max(0,clientsCount-oneTimers),status:b.status,rating:b.rating_avg}})}));
// ---------- Admin ----------
const adm=role("admin");
r.get("/admin/stats",adm,ah((req,res)=>res.json({data:{users:db.prepare("SELECT COUNT(*) n FROM users").get().n,businesses:db.prepare("SELECT COUNT(*) n FROM businesses WHERE status='approved'").get().n,pending:db.prepare("SELECT COUNT(*) n FROM businesses WHERE status='pending'").get().n,bookings:db.prepare("SELECT COUNT(*) n FROM bookings").get().n}})));
r.get("/admin/businesses",adm,ah((req,res)=>res.json({data:db.prepare("SELECT b.*,u.name owner,u.email ownerEmail FROM businesses b JOIN users u ON u.id=b.owner_id ORDER BY (b.status='pending') DESC,b.id DESC").all()})));
r.patch("/admin/businesses/:id/status",adm,ah((req,res)=>{const d=parse(z.object({status:z.enum(["approved","suspended","pending"])}),req.body);db.prepare("UPDATE businesses SET status=? WHERE id=?").run(d.status,+req.params.id);res.json({data:{ok:true}})}));
export default r;
