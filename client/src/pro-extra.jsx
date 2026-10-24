import {useEffect, useState} from "react";
import {CalendarPlus, MessageSquare, Trash2} from "lucide-react";
import {api, errMsg} from "./api.js";
import {useAuth} from "./auth.jsx";
import {addDays, dLabel, fcfa, today} from "./lib.js";
import {Btn, BtnCoral, Empty, Input, Label, Modal, Select, Skeleton, Stars, Textarea, useToast} from "./ui.jsx";

export function ManualBooking({onDone}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({serviceId: "", staffId: "", date: today(), time: "", clientName: "", clientPhone: "", notes: ""});
  const set = key => event => setForm(current => ({...current, [key]: event.target.value}));

  useEffect(() => {
    if (!open) return;
    Promise.all([api.get("/owner/business"), api.get("/owner/services"), api.get("/owner/staff")])
      .then(([b, s, t]) => {
        setBusiness(b);
        setServices(s);
        setStaff(t);
      })
      .catch(error => toast(errMsg(error)));
  }, [open]);

  useEffect(() => {
    if (!open || !business || !form.serviceId || !form.date) return;
    setLoading(true);
    setSlots([]);
    const query = new URLSearchParams({serviceId: form.serviceId, date: form.date});
    if (form.staffId) query.set("staffId", form.staffId);
    api.get(`/businesses/${business.id}/availability?${query}`)
      .then(setSlots)
      .catch(error => toast(errMsg(error)))
      .finally(() => setLoading(false));
  }, [open, business?.id, form.serviceId, form.date, form.staffId]);

  const options = form.serviceId ? staff.filter(member => member.serviceIds.includes(+form.serviceId)) : staff;
  const submit = async event => {
    event.preventDefault();
    if (!form.time) return toast("Choisissez un créneau");
    try {
      await api.post("/owner/bookings", {
        serviceId: +form.serviceId,
        staffId: form.staffId ? +form.staffId : null,
        startAt: `${form.date}T${form.time}`,
        clientName: form.clientName,
        clientPhone: form.clientPhone,
        notes: form.notes
      });
      toast("Réservation manuelle créée");
      setOpen(false);
      setForm({serviceId: "", staffId: "", date: today(), time: "", clientName: "", clientPhone: "", notes: ""});
      onDone?.();
    } catch (error) {
      toast(errMsg(error));
    }
  };

  return <>
    <Btn onClick={() => setOpen(true)} className="!px-4 !py-2"><CalendarPlus size={16}/>Manuelle</Btn>
    {open && <Modal title="Réservation téléphonique" onClose={() => setOpen(false)} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Service</Label><Select value={form.serviceId} onChange={e => setForm({...form, serviceId: e.target.value, staffId: "", time: ""})} required><option value="">Choisir…</option>{services.map(service => <option key={service.id} value={service.id}>{service.name} · {fcfa(service.price)}</option>)}</Select></div>
          <div><Label>Professionnel</Label><Select value={form.staffId} onChange={e => setForm({...form, staffId: e.target.value, time: ""})}><option value="">Peu importe</option>{options.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></div>
        </div>
        <div><Label>Date</Label><Input type="date" min={today()} value={form.date} onChange={e => setForm({...form, date: e.target.value, time: ""})} required/></div>
        <div><Label>Créneau</Label>{loading ? <Skeleton className="h-10"/> : slots.length ? <div className="flex flex-wrap gap-2">{slots.map(slot => <button type="button" key={slot.time} onClick={() => setForm({...form, time: slot.time})} className={"rounded-xl border px-3 py-2 text-sm " + (form.time === slot.time ? "border-teal bg-teal text-white" : "border-black/10 bg-white hover:border-coral")}>{slot.time.replace(":", "h")}</button>)}</div> : <p className="text-sm text-ink/50">Aucun créneau pour cette date.</p>}</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Nom du client</Label><Input value={form.clientName} onChange={set("clientName")} required/></div>
          <div><Label>Téléphone</Label><Input value={form.clientPhone} onChange={set("clientPhone")} required/></div>
        </div>
        <div><Label>Note interne (facultatif)</Label><Textarea rows={2} value={form.notes} onChange={set("notes")}/></div>
        <BtnCoral className="w-full" disabled={!form.time}>Créer la réservation</BtnCoral>
      </form>
    </Modal>}
  </>;
}

export function TimeOffEditor({staff}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [form, setForm] = useState({dateFrom: addDays(today(), 1), dateTo: addDays(today(), 1), reason: ""});
  const load = () => api.get(`/owner/staff/${staff.id}/time-off`).then(setList).catch(error => toast(errMsg(error)));

  useEffect(() => { if (open) load(); }, [open]);
  const add = async event => {
    event.preventDefault();
    try {
      await api.post(`/owner/staff/${staff.id}/time-off`, form);
      toast("Congé ajouté");
      setForm({dateFrom: addDays(today(), 1), dateTo: addDays(today(), 1), reason: ""});
      load();
    } catch (error) {
      toast(errMsg(error));
    }
  };
  const remove = async id => {
    try {
      await api.del(`/owner/staff/${staff.id}/time-off/${id}`);
      toast("Congé supprimé");
      load();
    } catch (error) {
      toast(errMsg(error));
    }
  };

  return <>
    <button onClick={() => setOpen(true)} className="text-sm underline">Congés</button>
    {open && <Modal title={`Congés de ${staff.name}`} onClose={() => setOpen(false)}>
      <form onSubmit={add} className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><div><Label>Du</Label><Input type="date" value={form.dateFrom} onChange={e => setForm({...form, dateFrom: e.target.value})} required/></div><div><Label>Au</Label><Input type="date" value={form.dateTo} onChange={e => setForm({...form, dateTo: e.target.value})} required/></div></div>
        <div><Label>Motif</Label><Input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Formation, vacances…"/></div>
        <BtnCoral className="w-full">Ajouter ce congé</BtnCoral>
      </form>
      <div className="mt-5 border-t border-black/10 pt-4">{list === null ? <Skeleton className="h-16"/> : list.length ? <div className="space-y-2">{list.map(item => <div key={item.id} className="flex items-center justify-between rounded-xl bg-black/5 px-3 py-2 text-sm"><span>{dLabel(item.date_from, {day: "numeric", month: "short"})} → {dLabel(item.date_to, {day: "numeric", month: "short"})}{item.reason ? ` · ${item.reason}` : ""}</span><button type="button" aria-label="Supprimer le congé" onClick={() => remove(item.id)} className="text-rose-600"><Trash2 size={16}/></button></div>)}</div> : <p className="text-sm text-ink/50">Aucun congé enregistré.</p>}</div>
    </Modal>}
  </>;
}

export function OwnerReviews() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const load = () => api.get("/owner/reviews").then(setList).catch(error => toast(errMsg(error)));
  useEffect(() => { load(); }, []);

  const send = async () => {
    try {
      await api.post(`/owner/reviews/${selected.id}/reply`, {reply});
      toast("Réponse publiée");
      setSelected(null);
      setReply("");
      load();
    } catch (error) {
      toast(errMsg(error));
    }
  };

  return <div><div className="mb-6 flex items-center justify-between"><h1 className="font-serif text-3xl font-semibold">Avis</h1><span className="text-sm text-ink/50">{list?.length || 0} avis</span></div>
    {list === null ? <Skeleton className="h-56"/> : list.length ? <div className="space-y-3">{list.map(review => <div key={review.id} className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><b>{review.client}</b><Stars value={review.rating} size={14}/></div><span className="text-xs text-ink/40">{dLabel(review.start_at.slice(0, 10), {day: "numeric", month: "short", year: "numeric"})}</span></div>
      <p className="mt-2 text-sm text-ink/70">{review.comment}</p>
      <p className="mt-1 text-xs text-ink/40">{review.service} · {review.code}</p>
      {review.reply ? <div className="mt-3 rounded-xl bg-teal/5 p-3 text-sm"><b>Votre réponse</b><p className="mt-1 text-ink/70">{review.reply}</p><button onClick={() => {setSelected(review); setReply(review.reply);}} className="mt-2 text-xs text-coral underline">Modifier</button></div>
        : <button onClick={() => {setSelected(review); setReply("");}} className="mt-3 inline-flex items-center gap-1 text-sm text-coral underline"><MessageSquare size={14}/>Répondre</button>}
    </div>)}</div> : <Empty icon="💬" title="Aucun avis pour le moment">Les retours de vos clients apparaîtront ici.</Empty>}
    {selected && <Modal title="Répondre à l'avis" onClose={() => setSelected(null)}><div className="space-y-4"><p className="rounded-xl bg-black/5 p-3 text-sm text-ink/70">« {selected.comment} »</p><Textarea rows={4} value={reply} onChange={e => setReply(e.target.value)} placeholder="Remerciez votre client ou apportez une précision…"/><BtnCoral onClick={send} className="w-full">Publier la réponse</BtnCoral></div></Modal>}
  </div>;
}

export function AdminUsers() {
  const {user} = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const load = () => api.get("/admin/users").then(setList).catch(error => toast(errMsg(error)));
  useEffect(() => { load(); }, []);

  const update = async (id, data) => {
    try {
      await api.patch(`/admin/users/${id}/role-or-block`, data);
      toast("Utilisateur mis à jour");
      load();
    } catch (error) {
      toast(errMsg(error));
    }
  };

  return <section className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-3xl font-semibold">Utilisateurs</h2><span className="text-sm text-ink/50">{list?.length || 0} comptes</span></div>
    {list === null ? <Skeleton className="h-48"/> : <div className="space-y-2">{list.map(item => <div key={item.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div><p className="font-medium">{item.name} {item.id === user?.id && <span className="text-xs text-ink/40">(vous)</span>}</p><p className="text-sm text-ink/60">{item.email} · {item.phone || "sans téléphone"}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={item.role} disabled={item.id === user?.id} onChange={e => update(item.id, {role: e.target.value})} className="!w-auto !py-2"><option value="client">Client</option><option value="owner">Prestataire</option><option value="admin">Admin</option></Select>
        {item.id !== user?.id && <button onClick={() => update(item.id, {blocked: !item.blocked})} className={"rounded-full px-4 py-2 text-xs font-medium " + (item.blocked ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700")}>{item.blocked ? "Réactiver" : "Bloquer"}</button>}
      </div>
    </div>)}</div>}
  </section>;
}
