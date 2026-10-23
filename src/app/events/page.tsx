"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getUserRSVPs, rsvpToEvent, cancelRSVP, getEventRSVPs } from "@/lib/firestore";
import { EventRSVP } from "@/types";
import { Calendar, Plus, X, Trash2, MapPin, Clock, Users, Check, GraduationCap } from "lucide-react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const MONTH_GRADIENTS = [
  "from-blue-500 to-indigo-600",   "from-purple-500 to-pink-600",
  "from-emerald-500 to-teal-600",  "from-amber-500 to-orange-500",
  "from-red-500 to-rose-600",      "from-pink-500 to-fuchsia-600",
  "from-indigo-500 to-violet-600", "from-teal-500 to-cyan-600",
  "from-orange-500 to-amber-600",  "from-cyan-500 to-blue-600",
  "from-rose-500 to-pink-600",     "from-green-500 to-emerald-600",
];

async function apiFetch(path: string, user: any, options?: RequestInit) {
  const token = await user.getIdToken();
  return fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  });
}

export default function EventsPage() {
  const { user, profile } = useAuth();
  const [events,       setEvents]       = useState<any[]>([]);
  const [rsvpCounts,   setRsvpCounts]   = useState<Record<string, number>>({});
  const [myRsvps,      setMyRsvps]      = useState<EventRSVP[]>([]);
  const [rsvpLoading,  setRsvpLoading]  = useState<Record<string, boolean>>({});
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [filter,       setFilter]       = useState<"upcoming" | "past" | "all">("upcoming");
  const [form, setForm] = useState({ title: "", description: "", eventDate: "", eventTime: "", location: "" });

  const load = async () => {
    if (!user) return;
    try {
      const res  = await apiFetch("/api/events", user);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);

      const counts = await Promise.all(
        data.map((e: any) => getEventRSVPs(e.id).then(r => [e.id, r.length] as [string, number]))
      );
      setRsvpCounts(Object.fromEntries(counts));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadMyRsvps = async () => {
    if (!user) return;
    try { setMyRsvps(await getUserRSVPs(user.uid)); }
    catch (err) { console.error(err); }
  };

  useEffect(() => { if (user) { load(); loadMyRsvps(); } }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.eventDate) return toast.error("Title and date are required");
    setSaving(true);
    try {
      const res = await apiFetch("/api/events", user, {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to create event");
        return;
      }
      toast.success("Event created!");
      setShowModal(false);
      setForm({ title: "", description: "", eventDate: "", eventTime: "", location: "" });
      load();
    } catch { toast.error("Failed to create event"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      const res = await apiFetch(`/api/events/${id}`, user, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete"); return; }
      toast.success("Event deleted!");
      setEvents(p => p.filter(e => e.id !== id));
    } catch { toast.error("Failed to delete"); }
  };

  const handleRSVP = async (eventId: string) => {
    if (!user) return;
    setRsvpLoading(p => ({ ...p, [eventId]: true }));
    try {
      const existing = myRsvps.find(r => r.eventId === eventId);
      if (existing) {
        await cancelRSVP(existing.id);
        setMyRsvps(p => p.filter(r => r.id !== existing.id));
        setRsvpCounts(p => ({ ...p, [eventId]: Math.max(0, (p[eventId] || 1) - 1) }));
        toast.success("RSVP cancelled");
      } else {
        const id = await rsvpToEvent(user.uid, eventId);
        setMyRsvps(p => [...p, { id, userId: user.uid, eventId, rsvpedAt: new Date().toISOString() }]);
        setRsvpCounts(p => ({ ...p, [eventId]: (p[eventId] || 0) + 1 }));
        toast.success("You're going!");
      }
    } catch { toast.error("Failed to update RSVP"); }
    finally { setRsvpLoading(p => ({ ...p, [eventId]: false })); }
  };

  const now = new Date();

  const eventDateTime = (e: any) => {
    if (e.eventTime) {
      return new Date(`${e.eventDate}T${e.eventTime}`);
    }
    // No time set — treat the whole day as upcoming until end of day
    const d = new Date(e.eventDate);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const filtered = events.filter(e => {
    const d = eventDateTime(e);
    if (filter === "upcoming") return d >= now;
    if (filter === "past")     return d < now;
    return true;
  });

  const upcoming = events.filter(e => eventDateTime(e) >= now).length;
  const past     = events.filter(e => eventDateTime(e) <  now).length;

  const canDelete = (event: any) =>
    profile?.role === "admin" || event.createdBy === user?.uid;

  return (
    <DashboardLayout>
      <div className="page-fade space-y-5">
        <div className="notebook-header flex items-center justify-between flex-wrap gap-3 px-5 py-4 md:px-6">
          <div>
            <h1 className="text-4xl md:text-5xl text-slate-800 leading-none mb-1">Events</h1>
            <p className="text-sm text-slate-500">{upcoming} upcoming · {past} past</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Event
          </Button>
        </div>

        <div className="paper-card p-3 md:p-4">
          <div className="flex gap-2 mb-6 flex-wrap">
            {(["upcoming", "all", "past"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-all border"
                style={filter === f
                  ? { background: "linear-gradient(135deg, #d7b462, #b08431)", color: "#fffaf0", borderColor: "transparent" }
                  : { background: "#f8f6f0", color: "#64748b", borderColor: "#e8e4da" }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-28 bg-[#f5f2ec] border border-[#e8e4da] rounded-2xl animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 bg-[#f5f2ec] border border-[#e8e4da] rounded-2xl flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No {filter} events</p>
              <Button className="mt-5" onClick={() => setShowModal(true)}>
                <Plus size={16} /> Add Event
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(event => {
                const date     = new Date(event.eventDate);
                const isPast   = eventDateTime(event) < now;
                const gradient = MONTH_GRADIENTS[date.getMonth()];
                const isRsvped = myRsvps.some(r => r.eventId === event.id);
                const count    = rsvpCounts[event.id] ?? 0;

                return (
                  <div key={event.id} className={`paper-card flex gap-5 items-start p-5 transition-all ${isPast ? "opacity-60" : ""}`}>
                    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-3 flex flex-col items-center justify-center min-w-[64px] shrink-0 shadow-sm`}>
                      <span className="text-white/80 text-[10px] font-bold uppercase tracking-wide">
                        {date.toLocaleString("default", { month: "short" })}
                      </span>
                      <span className="text-white text-2xl font-bold leading-none mt-0.5">{date.getDate()}</span>
                      <span className="text-white/70 text-[10px] mt-0.5">{date.getFullYear()}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-2xl text-slate-800 leading-snug">{event.title}</h3>
                          {event.isClassWide && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                              <GraduationCap size={10} /> Class
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPast ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"}`}>
                            {isPast ? "Past" : "Upcoming"}
                          </span>
                          {canDelete(event) && (
                            <button onClick={() => handleDelete(event.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {event.description && (
                        <p className="text-sm text-slate-600 mt-2 leading-relaxed">{event.description}</p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><Calendar size={12} /> {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                        {event.eventTime && <span className="inline-flex items-center gap-1.5"><Clock size={12} /> {event.eventTime}</span>}
                        {event.location && <span className="inline-flex items-center gap-1.5"><MapPin size={12} /> {event.location}</span>}
                        <span className="inline-flex items-center gap-1.5"><Users size={12} /> {count} RSVP{count === 1 ? "" : "s"}</span>
                      </div>
                    </div>

                    <div className="shrink-0 self-center">
                      <button onClick={() => handleRSVP(event.id)} disabled={rsvpLoading[event.id]}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                          isRsvped ? "bg-slate-100 text-slate-700 border border-slate-200" : "bg-[#d7b462] text-[#fffaf0] shadow-sm"
                        } ${rsvpLoading[event.id] ? "opacity-60" : ""}`}>
                        {rsvpLoading[event.id] ? "Saving..." : isRsvped ? "Going" : "RSVP"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="paper-card p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-3xl text-slate-800 leading-none">Add Event</h2>
                  <p className="text-sm text-slate-500 mt-1">Create a campus event</p>
                </div>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#f5f2ec] transition-colors border border-[#e8e4da]">
                  <X size={18} className="text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <Input label="Event Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Campus workshop" />
                <Input label="Location" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Main Hall" />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Date *" type="date" value={form.eventDate} onChange={e => setForm(p => ({ ...p, eventDate: e.target.value }))} />
                  <Input label="Time" type="time" value={form.eventTime} onChange={e => setForm(p => ({ ...p, eventTime: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Description</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    className="paper-input w-full px-3 py-2.5 text-sm outline-none resize-none min-h-[100px] text-slate-700"
                    placeholder="What should people know?"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="secondary" fullWidth onClick={() => setShowModal(false)}>Cancel</Button>
                  <Button type="submit" fullWidth loading={saving}>Create Event</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
