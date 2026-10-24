import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {Bell, Calendar, Check, Info, User} from "lucide-react";
import {api, errMsg} from "./api.js";
import {useAuth} from "./auth.jsx";
import {BizCard} from "./pub.jsx";
import {Btn, Empty, Input, Label, Skeleton, useToast} from "./ui.jsx";

export function NotificationsBell() {
  const {user} = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () => api.get("/notifications")
      .then(rows => alive && setUnread(rows.filter(row => !row.read).length))
      .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user]);

  if (!user) return null;
  return <Link to="/notifications" aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-full border border-black/10 transition hover:bg-black/5">
    <Bell size={18}/>
    {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
  </Link>;
}

export function NotificationsPage() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const load = () => api.get("/notifications").then(setList).catch(error => {
    toast(errMsg(error));
    setList([]);
  });
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    try {
      await api.post("/notifications/read-all");
      toast("Notifications marquées comme lues");
      load();
    } catch (error) {
      toast(errMsg(error));
    }
  };
  const markOne = async id => {
    try {
      await api.patch(`/notifications/${id}/read`);
      load();
    } catch (error) {
      toast(errMsg(error));
    }
  };

  const icon = type => type === "reminder" ? <Calendar size={18}/> : type === "booking" ? <Check size={18}/> : <Info size={18}/>;
  return <div className="mx-auto max-w-3xl px-5 py-10">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-serif text-4xl font-semibold">Notifications</h1><p className="mt-1 text-sm text-ink/60">Rappels, confirmations et nouvelles de Bookly.</p></div>
      {list?.some(item => !item.read) && <Btn onClick={markAll} className="!px-5 !py-2.5">Tout marquer comme lu</Btn>}
    </div>
    {list === null ? <Skeleton className="h-56"/> : list.length ? <div className="space-y-3">{list.map(item => <button key={item.id} onClick={() => markOne(item.id)} className={"card flex w-full items-start gap-4 p-5 text-left transition hover:-translate-y-0.5 " + (!item.read ? "border-coral/30 bg-coral/5" : "")}>
      <span className={"mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full " + (!item.read ? "bg-coral text-white" : "bg-black/5 text-ink/60")}>{icon(item.type)}</span>
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><b>{item.title}</b><span className="text-xs text-ink/40">{new Date(item.created_at).toLocaleString("fr-FR", {dateStyle: "short", timeStyle: "short"})}</span></span>
        <span className="mt-1 block text-sm text-ink/65">{item.body}</span>{!item.read && <span className="mt-2 inline-block text-xs font-medium text-coral">Marquer comme lu</span>}</span>
    </button>)}</div> : <Empty icon="🔔" title="Aucune notification">Vos rappels de rendez-vous apparaîtront ici.</Empty>}
  </div>;
}

export function FavoritesPage() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const load = () => api.get("/favorites").then(setList).catch(error => {
    toast(errMsg(error));
    setList([]);
  });
  useEffect(() => { load(); }, []);

  return <div className="mx-auto max-w-6xl px-5 py-10">
    <h1 className="font-serif text-4xl font-semibold">Mes favoris</h1>
    <p className="mt-1 text-sm text-ink/60">Retrouvez les prestataires que vous aimez.</p>
    <div className="mt-8">{list === null ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-64"/>)}</div>
      : list.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.map(business => <BizCard key={business.id} b={business} onChanged={load}/>)}</div>
      : <Empty icon="💚" title="Aucun favori">Ajoutez des prestataires avec le cœur sur les cartes.</Empty>}</div>
  </div>;
}

export function ProfilePage() {
  const {user, setUser} = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({name: user?.name || "", phone: user?.phone || ""});
  const [busy, setBusy] = useState(false);
  const set = key => event => setForm({...form, [key]: event.target.value});

  const save = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const updated = await api.patch("/auth/me", form);
      setUser(updated);
      toast("Profil mis à jour");
    } catch (error) {
      toast(errMsg(error));
    }
    setBusy(false);
  };

  return <div className="mx-auto max-w-xl px-5 py-10">
    <div className="mb-6 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-teal text-white"><User size={22}/></span><div><h1 className="font-serif text-3xl font-semibold">Mon profil</h1><p className="text-sm text-ink/60">{user?.email}</p></div></div>
    <form onSubmit={save} className="card space-y-4 p-6">
      <div><Label>Nom complet</Label><Input value={form.name} onChange={set("name")} required/></div>
      <div><Label>Téléphone</Label><Input value={form.phone} onChange={set("phone")}/></div>
      <div><Label>Email</Label><Input value={user?.email || ""} disabled className="opacity-60"/></div>
      <div className="flex flex-wrap gap-3"><Btn disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Btn><Link to="/notifications" className="self-center text-sm text-coral underline">Voir mes notifications</Link></div>
    </form>
  </div>;
}
