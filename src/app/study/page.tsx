"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  getUserStudyLogs, createStudyLog, deleteStudyLog, getUserCourses,
  getFocusNotes, saveFocusNote, updateFocusNote, deleteFocusNote,
} from "@/lib/firestore";
import { StudyLog, Course, FocusNote } from "@/types";
import {
  BookOpen, Plus, X, Trash2, Clock, Flame, Calendar,
  FileText, Pencil, Save, Search, TrendingUp, BarChart2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const COURSE_COLORS = [
  "#6366f1","#0ea5e9","#10b981","#f59e0b",
  "#ef4444","#06b6d4","#f97316","#ec4899",
];

const INPUT_CLS = "w-full px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white";

function getWeekDates() {
  const today = new Date();
  const day   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

const DAYS_LABEL = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TODAY      = new Date().toISOString().split("T")[0];

function calcStreak(logs: StudyLog[]) {
  const dateset = new Set(logs.map(l => l.date));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().split("T")[0];
    if (!dateset.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function fmtHours(h: number) {
  if (h === 0) return "0m";
  const hrs  = Math.floor(h);
  const mins = Math.round((h % 1) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType; label: string; value: string | number;
  sub: string; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#e8e4da] card-lift">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: bg }}>
        <Icon size={15} style={{ color }} />
      </div>
      <p className="text-[26px] font-bold leading-none mb-1 text-slate-900">{value}</p>
      <p className="text-[12px] text-slate-400 font-medium">{label}</p>
      <p className="text-[11px] text-slate-300 mt-0.5">{sub}</p>
    </div>
  );
}

// ─── Note modal ───────────────────────────────────────────────
function NoteModal({
  initial, courses, onClose, onSave,
}: {
  initial?: FocusNote; courses: Course[];
  onClose: () => void;
  onSave: (data: { title: string; content: string; courseId?: string; date: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title:    initial?.title    ?? "",
    content:  initial?.content  ?? "",
    courseId: (initial as any)?.courseId ?? "",
    date:     initial?.date     ?? TODAY,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!form.title.trim())   return toast.error("Title is required");
    if (!form.content.trim()) return toast.error("Content is required");
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#f5f2ec] shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-slate-900">{initial ? "Edit Note" : "New Study Note"}</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">Capture what you learned</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Title *</label>
            <input placeholder="e.g. Chapter 4 — Data Structures"
              value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className={INPUT_CLS} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Course</label>
              <select value={form.courseId} onChange={e => setForm(p => ({ ...p, courseId: e.target.value }))}
                className={INPUT_CLS}>
                <option value="">No course</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Date</label>
              <input type="date" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className={INPUT_CLS} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Content *</label>
            <textarea rows={7} placeholder="Write your notes here…"
              value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              className={`${INPUT_CLS} resize-none`} />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
              {saving
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><Save size={13} /> {initial ? "Save Changes" : "Create Note"}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function StudyPage() {
  const { user } = useAuth();
  const [logs,        setLogs]        = useState<StudyLog[]>([]);
  const [notes,       setNotes]       = useState<FocusNote[]>([]);
  const [courses,     setCourses]     = useState<Course[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [tab,         setTab]         = useState<"sessions" | "notes">("sessions");
  const [showSession, setShowSession] = useState(false);
  const [showNote,    setShowNote]    = useState(false);
  const [editNote,    setEditNote]    = useState<FocusNote | null>(null);
  const [noteSearch,  setNoteSearch]  = useState("");
  const [noteCourse,  setNoteCourse]  = useState("all");
  const [weekDates]                   = useState(getWeekDates());
  const [form, setForm] = useState({ courseId: "", date: TODAY, hours: "", note: "" });

  const load = async () => {
    if (!user) return;
    try {
      const [l, c, n] = await Promise.all([
        getUserStudyLogs(user.uid),
        getUserCourses(user.uid),
        getFocusNotes(user.uid),
      ]);
      setLogs(l); setCourses(c); setNotes(n);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);

  const handleCreateSession = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const h = parseFloat(form.hours);
    if (!form.courseId)     return toast.error("Select a course");
    if (isNaN(h) || h <= 0) return toast.error("Enter valid hours");
    if (h > 24)             return toast.error("Hours cannot exceed 24");
    setSaving(true);
    try {
      await createStudyLog({
        userId: user!.uid, courseId: form.courseId,
        date: form.date, hours: h, note: form.note,
        createdAt: new Date().toISOString(),
      });
      toast.success("Session logged!");
      setShowSession(false);
      setForm({ courseId: "", date: TODAY, hours: "", note: "" });
      load();
    } catch { toast.error("Failed to log session"); }
    finally { setSaving(false); }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Delete this log?")) return;
    try { await deleteStudyLog(id); toast.success("Deleted!"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const handleSaveNote = async (data: { title: string; content: string; courseId?: string; date: string }) => {
    const now = new Date().toISOString();
    if (editNote) {
      await updateFocusNote(editNote.id, { ...data, updatedAt: now });
      toast.success("Note updated!"); setEditNote(null);
    } else {
      await saveFocusNote({ userId: user!.uid, ...data, createdAt: now, updatedAt: now } as any);
      toast.success("Note saved!"); setShowNote(false);
    }
    load();
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    try { await deleteFocusNote(id); toast.success("Note deleted!"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  // ── Stats ─────────────────────────────────────────────────
  const totalHours = logs.reduce((s, l) => s + l.hours, 0);
  const weekHours  = logs.filter(l => weekDates.includes(l.date)).reduce((s, l) => s + l.hours, 0);
  const todayHours = logs.filter(l => l.date === TODAY).reduce((s, l) => s + l.hours, 0);
  const streak     = calcStreak(logs);

  const weekData = weekDates.map((date, i) => ({
    day:   DAYS_LABEL[i],
    hours: parseFloat(logs.filter(l => l.date === date).reduce((s, l) => s + l.hours, 0).toFixed(1)),
    today: date === TODAY,
  }));

  const byCourse = courses.map((c, i) => ({
    course: c,
    hours:  logs.filter(l => l.courseId === c.id).reduce((s, l) => s + l.hours, 0),
    color:  COURSE_COLORS[i % COURSE_COLORS.length],
  })).filter(x => x.hours > 0).sort((a, b) => b.hours - a.hours);

  const recent     = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const getCourse  = (id: string) => courses.find(c => c.id === id);

  const filteredNotes = notes
    .filter(n => {
      const q = noteSearch.toLowerCase();
      return (!q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
        && (noteCourse === "all" || (n as any).courseId === noteCourse);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Group sessions by month
  const grouped = recent.reduce<Record<string, StudyLog[]>>((acc, l) => {
    const key = l.date.slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(l);
    return acc;
  }, {});

  return (
    <DashboardLayout>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-slate-900 leading-tight">Study</h1>
          <p className="text-[13px] text-slate-400 mt-1">
            {logs.length} session{logs.length !== 1 ? "s" : ""} · {fmtHours(totalHours)} total
          </p>
        </div>
        <button
          onClick={() => tab === "notes" ? setShowNote(true) : setShowSession(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
          style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
          <Plus size={15} /> {tab === "notes" ? "New Note" : "Log Session"}
        </button>
      </div>

      {/* ── Stat row ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger">
        <StatCard icon={Flame}     label="Study Streak"  value={`${streak}d`}                color="#f97316" bg="#fff7ed" sub={streak >= 3 ? "Keep the streak alive" : "Start a streak today"} />
        <StatCard icon={Clock}     label="Today"         value={fmtHours(todayHours)}         color="#6366f1" bg="#eef2ff" sub="studied today" />
        <StatCard icon={Calendar}  label="This Week"     value={fmtHours(weekHours)}          color="#0ea5e9" bg="#f0f9ff" sub="this week" />
        <StatCard icon={FileText}  label="Notes"         value={notes.length}                 color="#16a34a" bg="#f0fdf4" sub={`${logs.length} sessions logged`} />
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: "#ece8e1" }}>
        {([
          { key: "sessions", icon: BarChart2, label: "Sessions" },
          { key: "notes",    icon: FileText,  label: "Notes"    },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={tab === key
              ? { background: "#fff", color: "#0f172a", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
              : { color: "#94a3b8" }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── SESSIONS TAB ───────────────────────────────────── */}
      {tab === "sessions" && (
        <>
          {logs.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">

              {/* Weekly bar chart */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-[#e8e4da] card-lift">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-semibold text-slate-800">This Week</h2>
                  <span className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: "#eef2ff", color: "#6366f1" }}>
                    {fmtHours(weekHours)}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={weekData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f2ec" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="h" />
                    <Tooltip
                      formatter={(v: any) => [`${v}h`, "Hours"]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e8e4da", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: 12 }} />
                    <Bar dataKey="hours" radius={[6,6,0,0]}
                      shape={(props: any) => (
                        <rect x={props.x} y={props.y} width={props.width} height={props.height}
                          rx={6} fill={props.today ? "#6366f1" : "#c7d2fe"} />
                      )} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* By course */}
              <div className="bg-white rounded-2xl p-5 border border-[#e8e4da] card-lift">
                <h2 className="text-[13px] font-semibold text-slate-800 mb-4">By Course</h2>
                {byCourse.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {byCourse.map(({ course, hours, color }) => (
                      <div key={course.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12px] font-semibold text-slate-700 truncate max-w-[120px]">{course.code}</span>
                          <span className="text-[12px] text-slate-500 font-semibold">{fmtHours(hours)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full transition-all duration-700"
                            style={{ width: `${(hours / totalHours) * 100}%`, background: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Session list */}
          <div className="bg-white rounded-2xl border border-[#e8e4da] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f5f2ec] flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-slate-800">All Sessions</h2>
              <span className="text-[12px] text-slate-400">{logs.length} total · {fmtHours(totalHours)}</span>
            </div>

            {loading ? (
              <div className="p-5 space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-14 bg-[#f5f2ec] rounded-xl animate-pulse" />)}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  <BookOpen size={28} className="text-white/70" />
                </div>
                <p className="font-semibold text-slate-600">No sessions logged yet</p>
                <p className="text-sm text-slate-400 mt-1">Start logging your study sessions to build your streak.</p>
                <button onClick={() => setShowSession(true)}
                  className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  <Plus size={15} /> Log First Session
                </button>
              </div>
            ) : (
              <div>
                {Object.entries(grouped).map(([month, recs]) => (
                  <div key={month}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-5 pt-4 pb-1">
                      {new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </p>
                    <ul className="divide-y divide-[#f8f5f0]">
                      {recs.map(log => {
                        const c = getCourse(log.courseId);
                        const d = new Date(log.date);
                        return (
                          <li key={log.id}
                            className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#faf8f4] transition-colors group">
                            {/* Date badge */}
                            <div className="w-11 shrink-0 flex flex-col items-center justify-center bg-[#f5f2ec] rounded-xl py-1.5">
                              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider leading-none">
                                {d.toLocaleDateString("en-US", { month: "short" })}
                              </span>
                              <span className="text-[18px] font-bold text-slate-800 leading-tight">{d.getDate()}</span>
                              <span className="text-[9px] text-slate-400 leading-none">
                                {d.toLocaleDateString("en-US", { weekday: "short" })}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {c && (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg"
                                    style={{ background: "rgba(201,168,76,0.12)", color: "#b98a2e" }}>
                                    {c.code}
                                  </span>
                                )}
                                {log.note && (
                                  <span className="text-[12px] text-slate-500 truncate">{log.note}</span>
                                )}
                              </div>
                              {c && (
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{c.name}</p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <p className="text-[15px] font-bold text-slate-900">{log.hours}h</p>
                              <p className="text-[11px] text-slate-400">{fmtHours(log.hours)}</p>
                            </div>

                            <button onClick={() => handleDeleteSession(log.id)}
                              className="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                              <Trash2 size={14} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── NOTES TAB ──────────────────────────────────────── */}
      {tab === "notes" && (
        <>
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input placeholder="Search notes…" value={noteSearch}
                onChange={e => setNoteSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white placeholder:text-slate-300" />
            </div>
            {courses.length > 0 && (
              <select value={noteCourse} onChange={e => setNoteCourse(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] bg-white text-slate-600">
                <option value="all">All Courses</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-44 bg-white rounded-2xl border border-[#e8e4da] animate-pulse" />)}
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                <FileText size={28} className="text-white/70" />
              </div>
              <p className="font-semibold text-slate-600">
                {noteSearch || noteCourse !== "all" ? "No notes match your search" : "No notes yet"}
              </p>
              <p className="text-sm text-slate-400 mt-1">Capture what you learn during study sessions.</p>
              {!noteSearch && noteCourse === "all" && (
                <button onClick={() => setShowNote(true)}
                  className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  <Plus size={15} /> Create First Note
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredNotes.map(note => {
                const course = getCourse((note as any).courseId);
                return (
                  <div key={note.id}
                    className="bg-white rounded-2xl border border-[#e8e4da] p-5 card-lift flex flex-col group">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-900 leading-snug line-clamp-2 flex-1">{note.title}</h3>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditNote(note)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-100">
                          <Pencil size={12} className="text-slate-400" />
                        </button>
                        <button onClick={() => handleDeleteNote(note.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50">
                          <Trash2 size={12} className="text-slate-300 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[13px] text-slate-500 line-clamp-4 flex-1 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#f5f2ec]">
                      <div>
                        {course && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg"
                            style={{ background: "rgba(201,168,76,0.12)", color: "#b98a2e" }}>
                            {course.code}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(note.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Log Session Modal ──────────────────────────────── */}
      {showSession && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f5f2ec]">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900">Log Study Session</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Record a study session for a course</p>
              </div>
              <button onClick={() => setShowSession(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Course *</label>
                <select value={form.courseId}
                  onChange={e => setForm(p => ({ ...p, courseId: e.target.value }))}
                  className={INPUT_CLS}>
                  <option value="">Select a course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Hours *</label>
                  <div className="relative">
                    <input type="number" step="0.5" min="0.5" max="24" placeholder="e.g. 1.5"
                      value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                      className={`${INPUT_CLS} pr-10`} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-medium">hrs</span>
                  </div>
                  {form.hours && !isNaN(parseFloat(form.hours)) && parseFloat(form.hours) > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">{fmtHours(parseFloat(form.hours))}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Date *</label>
                  <input type="date" value={form.date}
                    onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className={INPUT_CLS} />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Note (optional)</label>
                <input placeholder="e.g. Chapter 4 revision" value={form.note}
                  onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                  className={INPUT_CLS} />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={() => setShowSession(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : "Log Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNote   && <NoteModal courses={courses} onClose={() => setShowNote(false)}    onSave={handleSaveNote} />}
      {editNote   && <NoteModal initial={editNote} courses={courses} onClose={() => setEditNote(null)} onSave={handleSaveNote} />}
    </DashboardLayout>
  );
}
