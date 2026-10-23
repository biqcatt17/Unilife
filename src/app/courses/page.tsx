"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getUserCourses, createCourse, updateCourse, deleteCourse } from "@/lib/firestore";
import { Course } from "@/types";
import { BookOpen, Plus, X, Pencil, Trash2, Clock, MapPin, User, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

// ─── Constants ───────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]; // default visible

const COLORS = [
  { key: "blue",   bg: "bg-blue-500",   light: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300",   solid: "#3b82f6" },
  { key: "violet", bg: "bg-violet-500", light: "bg-violet-50", text: "text-violet-700", border: "border-violet-300", solid: "#8b5cf6" },
  { key: "green",  bg: "bg-green-500",  light: "bg-green-50",  text: "text-green-700",  border: "border-green-300",  solid: "#22c55e" },
  { key: "amber",  bg: "bg-amber-500",  light: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300",  solid: "#f59e0b" },
  { key: "rose",   bg: "bg-rose-500",   light: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-300",   solid: "#f43f5e" },
  { key: "teal",   bg: "bg-teal-500",   light: "bg-teal-50",   text: "text-teal-700",   border: "border-teal-300",   solid: "#14b8a6" },
  { key: "orange", bg: "bg-orange-500", light: "bg-orange-50", text: "text-orange-700", border: "border-orange-300", solid: "#f97316" },
  { key: "pink",   bg: "bg-pink-500",   light: "bg-pink-50",   text: "text-pink-700",   border: "border-pink-300",   solid: "#ec4899" },
];

const getColor = (key?: string) => COLORS.find(c => c.key === key) ?? COLORS[0];

const timeToMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt12 = (t: string) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const BLANK_FORM = {
  name: "", code: "", description: "", instructor: "",
  room: "", days: [] as string[], startTime: "08:00",
  endTime: "09:30", color: "blue",
};

const HOUR_H   = 48;   // px per hour
const GUTTER_W = 48;   // px for time gutter

// ─── Weekly Timetable ────────────────────────────────────────
function WeeklyTimetable({
  courses, now, onEdit, onDelete,
}: {
  courses: Course[]; now: Date;
  onEdit: (c: Course) => void; onDelete: (id: string) => void;
}) {
  const todayShort = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getDay()];
  const nowMin     = now.getHours() * 60 + now.getMinutes();
  const [popup, setPopup] = useState<{ course: Course; day: string } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Show Mon–Fri always; add Sat/Sun if any course uses them
  const hasSat = courses.some(c => c.days?.includes("Sat"));
  const hasSun = courses.some(c => c.days?.includes("Sun"));
  const visibleDays = [...WEEK_DAYS, ...(hasSat ? ["Sat"] : []), ...(hasSun ? ["Sun"] : [])];

  // Time range: round to nearest hour, with padding
  const allMins    = courses.flatMap(c => [timeToMin(c.startTime), timeToMin(c.endTime)]);
  const startHour  = allMins.length ? Math.max(6, Math.floor(Math.min(...allMins) / 60) - 1) : 7;
  const endHour    = allMins.length ? Math.min(22, Math.ceil(Math.max(...allMins) / 60) + 1) : 19;
  const totalHours = endHour - startHour;
  const gridH      = totalHours * HOUR_H;

  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  const nowLineTop = ((nowMin / 60) - startHour) * HOUR_H;
  const showNowLine = nowMin / 60 >= startHour && nowMin / 60 <= endHour;

  // Close popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="rounded-2xl border border-[#e8e3d9] bg-[#fffdf9] overflow-hidden shadow-sm">
      <div className="flex border-b border-[#e8e3d9]" style={{ paddingLeft: GUTTER_W }}>
        {visibleDays.map(d => (
          <div key={d} className="flex-1 py-2.5 text-center border-l border-[#e8e3d9] first:border-l-0">
            <span className="inline-flex items-center justify-center min-w-[52px] text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1.5 rounded-full"
              style={d === todayShort
                ? { background: "linear-gradient(135deg, #b98a2e, #8d6619)", color: "#fff" }
                : { background: "#f5f0e6", color: "#667085" }}>{d}</span>
          </div>
        ))}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)", minHeight: 320 }}>
        <div className="relative" style={{ height: gridH }}>
          {hourLabels.map((h, i) => (
            <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none"
              style={{ top: i * HOUR_H }}>
              <div className="flex items-center justify-end shrink-0 pr-3 pt-0" style={{ width: GUTTER_W }}>
                <span className="text-[10px] text-slate-400 font-semibold leading-none -translate-y-[6px]">
                  {h === 12 ? "12 PM" : h > 12 ? `${h-12} PM` : `${h} AM`}
                </span>
              </div>
              <div className="flex-1 border-t border-[#f0efe9]" />
            </div>
          ))}

          {Array.from({ length: totalHours }, (_, i) => (
            <div key={i} className="absolute left-0 right-0 pointer-events-none" style={{ top: i * HOUR_H + HOUR_H / 2 }}>
              <div style={{ marginLeft: GUTTER_W, borderTop: "1px dashed #f1efe8" }} />
            </div>
          ))}

          <div className="absolute inset-0 flex" style={{ left: GUTTER_W }}>
            {visibleDays.map(d => (
              <div key={d} className={`flex-1 border-l border-[#f4f1eb] first:border-l-0 ${d === todayShort ? "bg-amber-50/35" : "bg-[#fffdfa]"}`} />
            ))}
          </div>

          {showNowLine && (
            <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
              style={{ top: nowLineTop }}>
              <div className="flex justify-end pr-1.5 shrink-0" style={{ width: GUTTER_W }}>
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm" />
              </div>
              <div className="flex-1 border-t-2 border-red-400" />
            </div>
          )}

          {courses.map(course => {
            const col      = getColor(course.color);
            const startMin = timeToMin(course.startTime);
            const endMin   = timeToMin(course.endTime);
            const topPx    = ((startMin / 60) - startHour) * HOUR_H;
            const heightPx = ((endMin - startMin) / 60) * HOUR_H;

            return course.days?.map(day => {
              const dayIdx = visibleDays.indexOf(day);
              if (dayIdx === -1) return null;
              const isNow   = day === todayShort && nowMin >= startMin && nowMin < endMin;
              const colW    = `calc((100% - ${GUTTER_W}px) / ${visibleDays.length})`;
              const leftPx  = `calc(${GUTTER_W}px + ${dayIdx} * (100% - ${GUTTER_W}px) / ${visibleDays.length})`;

              return (
                <button key={`${course.id}-${day}`}
                  onClick={() => setPopup(p => p?.course.id === course.id && p.day === day ? null : { course, day })}
                  className={`absolute rounded-xl overflow-hidden text-left transition-all hover:brightness-95 z-10 border border-white/60 ${col.light}`}
                  style={{
                    top: topPx + 3, height: Math.max(heightPx - 6, 22),
                    left: leftPx, width: colW,
                    padding: "6px 7px 5px",
                    boxShadow: isNow ? `0 0 0 2px ${col.solid}50` : "0 6px 12px rgba(15, 23, 42, 0.06)",
                  }}>
                  {isNow && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  )}
                  <p className={`text-[11px] font-bold leading-tight truncate ${col.text}`}>{course.code}</p>
                  {heightPx > 38 && (
                    <p className="text-[10px] text-slate-600 truncate leading-tight mt-0.5">{course.name}</p>
                  )}
                  {heightPx > 62 && course.room && (
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{course.room}</p>
                  )}
                </button>
              );
            });
          })}

          {/* Detail popup */}
          {popup && (() => {
            const { course, day } = popup;
            const col     = getColor(course.color);
            const dayIdx  = visibleDays.indexOf(day);
            const startMin = timeToMin(course.startTime);
            const topPx   = ((startMin / 60) - startHour) * HOUR_H;
            const colCount = visibleDays.length;
            const fromRight = dayIdx >= colCount / 2;

            return (
              <div ref={popupRef}
                className="absolute z-30 w-56 bg-white rounded-xl shadow-xl border border-[#e4e4dc] p-4"
                style={{
                  top: topPx,
                  ...(fromRight
                    ? { right: `calc(${(colCount - dayIdx) * 100 / colCount}% + 4px)` }
                    : { left: `calc(${GUTTER_W}px + ${(dayIdx + 1) * 100 / colCount}% + 4px)` }),
                }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.light} ${col.text}`}>{course.code}</span>
                    <p className="font-semibold text-slate-800 text-sm mt-1 leading-snug">{course.name}</p>
                  </div>
                  <button onClick={() => setPopup(null)} className="text-slate-300 hover:text-slate-500 mt-0.5">
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-1 text-xs text-slate-500 mb-3">
                  <p className="flex items-center gap-1.5"><Clock size={11} /> {fmt12(course.startTime)} – {fmt12(course.endTime)}</p>
                  {course.room && <p className="flex items-center gap-1.5"><MapPin size={11} /> {course.room}</p>}
                  {course.instructor && <p className="flex items-center gap-1.5"><User size={11} /> {course.instructor}</p>}
                </div>
                {!course.isOfficial && (
                  <div className="flex gap-2">
                    <button onClick={() => { setPopup(null); onEdit(course); }}
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-slate-600 border border-[#e4e4dc] rounded-lg py-1.5 hover:bg-slate-50 transition-colors">
                      <Pencil size={11} /> Edit
                    </button>
                    <button onClick={() => { setPopup(null); onDelete(course.id); }}
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-red-500 border border-red-100 rounded-lg py-1.5 hover:bg-red-50 transition-colors">
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                )}
                {course.isOfficial && (
                  <p className="text-[10px] text-slate-400 text-center">Official course · managed by admin</p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── Today Strip ─────────────────────────────────────────────
function getDayOrderIndex(day: string) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function getNextClass(courses: Course[], now: Date) {
  const todayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const upcoming = courses
    .filter(course => course.days && course.days.length > 0)
    .map(course => {
      const dayIndex = getDayOrderIndex(todayShort);
      const courseMatchesToday = course.days!.includes(todayShort);
      const time = timeToMin(course.startTime);
      const isAfterNow = courseMatchesToday ? time >= currentMinutes : true;
      const daysUntil = course.days!.reduce((closest, day) => {
        const diff = (getDayOrderIndex(day) - dayIndex + 7) % 7;
        return Math.min(closest, diff === 0 ? (courseMatchesToday ? 0 : 7) : diff);
      }, 7);

      return {
        course,
        sortKey: (daysUntil * 24 * 60) + time,
        isAfterNow,
      };
    })
    .filter(item => item.isAfterNow)
    .sort((a, b) => a.sortKey - b.sortKey)[0];

  return upcoming?.course ?? null;
}

function ScheduleOverview({ courses, now }: { courses: Course[]; now: Date }) {
  const todayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const todayCourses = courses.filter(c => c.days?.includes(todayShort));
  const nextClass = getNextClass(courses, now);
  const totalMinutes = courses.reduce((sum, c) => sum + Math.max(0, timeToMin(c.endTime) - timeToMin(c.startTime)), 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  const cards = [
    {
      label: "Today",
      value: `${todayCourses.length} class${todayCourses.length === 1 ? "" : "es"}`,
      detail: todayCourses.length ? `${fmt12(todayCourses[0].startTime)} • ${todayCourses[0].code}` : "No classes",
      accent: "amber",
    },
    {
      label: "Next class",
      value: nextClass ? nextClass.code : "No upcoming",
      detail: nextClass ? `${nextClass.name} • ${fmt12(nextClass.startTime)}` : "Add a class to your timetable",
      accent: "blue",
    },
    {
      label: "Study load",
      value: `${totalHours}h/week`,
      detail: `${courses.length} course${courses.length === 1 ? "" : "s"} scheduled`,
      accent: "green",
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3 mb-4">
      {cards.map(card => (
        <div key={card.label} className="rounded-2xl border border-[#e8e2d6] bg-gradient-to-br from-white to-[#faf7f1] p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.label}</span>
            <span className={`h-2.5 w-2.5 rounded-full ${card.accent === "amber" ? "bg-amber-400" : card.accent === "blue" ? "bg-blue-400" : "bg-emerald-400"}`} />
          </div>
          <div className="text-lg font-bold text-slate-800 leading-tight">{card.value}</div>
          <div className="mt-1 text-xs text-slate-500 line-clamp-2">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}

function TodayStrip({ courses, now }: { courses: Course[]; now: Date }) {
  const todayShort   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getDay()];
  const nowMin       = now.getHours() * 60 + now.getMinutes();
  const todayCourses = courses
    .filter(c => c.days?.includes(todayShort))
    .sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));

  if (todayCourses.length === 0) return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 mb-4">No classes today.</div>
  );

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Today</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {todayCourses.map(c => {
          const col   = getColor(c.color);
          const isNow = nowMin >= timeToMin(c.startTime) && nowMin < timeToMin(c.endTime);
          return (
            <div key={c.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium ${col.light} ${col.text} ${col.border} ${isNow ? "ring-1 ring-offset-1 ring-current" : ""}`}>
              {isNow && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
              <span>{c.code}</span>
              <span className="text-slate-400 font-normal">{fmt12(c.startTime)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Course Modal ────────────────────────────────────────────
function CourseModal({ initial, onClose, onSave, saving }: {
  initial: typeof BLANK_FORM & { id?: string };
  onClose: () => void;
  onSave:  (form: typeof BLANK_FORM) => Promise<void>;
  saving:  boolean;
}) {
  const [form, setForm] = useState(initial);
  const isEdit = !!initial.id;
  const toggleDay = (d: string) =>
    setForm(p => ({ ...p, days: p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d] }));

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!form.name || !form.code)         return toast.error("Name and code are required");
    if (form.days.length === 0)           return toast.error("Select at least one day");
    if (!form.startTime || !form.endTime) return toast.error("Set start and end time");
    if (form.startTime >= form.endTime)   return toast.error("End time must be after start time");
    await onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{isEdit ? "Edit Course" : "Add Course"}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{isEdit ? "Update course details" : "Add a course to your schedule"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Course Name *" placeholder="e.g. Calculus I" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <Input label="Code *" placeholder="e.g. MATH101" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Instructor" placeholder="e.g. Dr. Sokha" value={form.instructor} onChange={e => setForm(p => ({ ...p, instructor: e.target.value }))} />
            <Input label="Room / Location" placeholder="e.g. Room 201" value={form.room ?? ""} onChange={e => setForm(p => ({ ...p, room: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time *" type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
            <Input label="End Time *" type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Days *</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
                  style={form.days.includes(d)
                    ? { background: "linear-gradient(135deg, #b98a2e, #8b5e1b)", color: "#fff", borderColor: "transparent" }
                    : { background: "#fff", color: "#475569", borderColor: "#e8e4da" }}>{d}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c.key} type="button" onClick={() => setForm(p => ({ ...p, color: c.key }))}
                  className={`w-8 h-8 rounded-full ${c.bg} transition-all ${form.color === c.key ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                  title={c.key} />
              ))}
            </div>
          </div>
          <Input label="Description" placeholder="Optional notes…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
            <Button type="submit" fullWidth loading={saving}>{isEdit ? "Save Changes" : "Add Course"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────
export default function SchedulePage() {
  const { user, profile } = useAuth();
  const [courses,  setCourses]  = useState<Course[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing,    setEditing]    = useState<Course | null>(null);
  const [now,        setNow]        = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    if (!user) return;
    try { setCourses(await getUserCourses(user.uid, profile?.classId)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);

  const openAdd    = () => { setEditing(null); setShowModal(true); };
  const openEdit   = (c: Course) => { setEditing(c); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSave = async (form: typeof BLANK_FORM) => {
    setSaving(true);
    try {
      if (editing) {
        await updateCourse(editing.id, form);
        toast.success("Course updated!");
      } else {
        await createCourse({ ...form, userId: user!.uid, createdAt: new Date().toISOString() });
        toast.success("Course added!");
      }
      closeModal();
      load();
    } catch { toast.error("Failed to save course"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this course?")) return;
    try { await deleteCourse(id); toast.success("Removed!"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timetable</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {courses.length > 0 && ` · ${courses.length} course${courses.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openAdd}><Plus size={16} /> Add Course</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-8 w-64 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-[500px] bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">No courses yet</h2>
          <p className="text-gray-400 text-sm mb-5 max-w-xs">Add your courses to build your weekly timetable.</p>
          <Button onClick={openAdd}><Plus size={16} /> Add Course</Button>
        </div>
      ) : (
        <>
          <ScheduleOverview courses={courses} now={now} />
          <TodayStrip courses={courses} now={now} />
          <WeeklyTimetable courses={courses} now={now} onEdit={openEdit} onDelete={handleDelete} />
        </>
      )}

      {showModal && (
        <CourseModal
          initial={editing
            ? { id: editing.id, name: editing.name, code: editing.code,
                description: editing.description ?? "", instructor: editing.instructor ?? "",
                room: editing.room ?? "", days: editing.days ?? [],
                startTime: editing.startTime, endTime: editing.endTime, color: editing.color ?? "blue" }
            : { ...BLANK_FORM }}
          onClose={closeModal} onSave={handleSave} saving={saving}
        />
      )}
    </DashboardLayout>
  );
}
