"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAttendance, markAttendance, updateAttendance, getUserCourses } from "@/lib/firestore";
import { AttendanceRecord, Course } from "@/types";
import {
  ClipboardList, Plus, X, CheckCircle2, XCircle, Clock,
  AlertTriangle, TrendingUp, TrendingDown, Settings, ShieldCheck, CalendarCheck,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Config ──────────────────────────────────────────────────
const STATUS = {
  present: {
    label: "Present",
    icon: CheckCircle2,
    text: "text-green-600", bg: "bg-green-50", border: "border-green-200",
    badge: "bg-green-100 text-green-700",
    bar: "#16a34a",
  },
  absent: {
    label: "Absent",
    icon: XCircle,
    text: "text-red-600", bg: "bg-red-50", border: "border-red-200",
    badge: "bg-red-100 text-red-700",
    bar: "#dc2626",
  },
  late: {
    label: "Late",
    icon: Clock,
    text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    bar: "#d97706",
  },
} as const;

const INPUT_CLS = "w-full px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm text-slate-800 outline-none transition-all focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white";

const DEFAULT_WEEKS    = 16;
const DEFAULT_MAX_ABS  = 4;
const SETTINGS_KEY     = "unilife_att_settings";

interface AttSettings {
  weeks: number;
  maxAbsences: number;
  courseLimits: Record<string, number>; // courseId → limit override
}

function loadSettings(): AttSettings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      return { weeks: DEFAULT_WEEKS, maxAbsences: DEFAULT_MAX_ABS, courseLimits: {}, ...parsed };
    }
  } catch {}
  return { weeks: DEFAULT_WEEKS, maxAbsences: DEFAULT_MAX_ABS, courseLimits: {} };
}

function getCourseLimit(settings: AttSettings, courseId: string): number {
  return settings.courseLimits[courseId] ?? settings.maxAbsences;
}

function rateColor(r: number, minRate: number) {
  return r >= minRate ? "#16a34a" : r >= minRate - 15 ? "#d97706" : "#dc2626";
}
function rateBg(r: number, minRate: number) {
  return r >= minRate
    ? "bg-green-50 text-green-700"
    : r >= minRate - 15
    ? "bg-amber-50 text-amber-700"
    : "bg-red-50 text-red-700";
}

function StatCard({ value, label, icon: Icon, color, bg }: {
  value: string | number; label: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#e8e4da] card-lift">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: bg }}>
        <Icon size={15} style={{ color }} />
      </div>
      <p className="text-[26px] font-bold leading-none mb-1 text-slate-900">{value}</p>
      <p className="text-[12px] text-slate-400 font-medium">{label}</p>
    </div>
  );
}

export default function AttendancePage() {
  const { user, profile } = useAuth();
  const [records,      setRecords]      = useState<AttendanceRecord[]>([]);
  const [courses,      setCourses]      = useState<Course[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [courseFilter, setCourseFilter] = useState("all");

  // Absence limit settings (stored in localStorage)
  const [settings,     setSettings]     = useState<AttSettings>({ weeks: DEFAULT_WEEKS, maxAbsences: DEFAULT_MAX_ABS, courseLimits: {} });
  const [settingsForm, setSettingsForm] = useState<AttSettings>({ weeks: DEFAULT_WEEKS, maxAbsences: DEFAULT_MAX_ABS, courseLimits: {} });

  const [form, setForm] = useState({
    courseId: "",
    date:     new Date().toISOString().split("T")[0],
    status:   "present" as AttendanceRecord["status"],
  });

  // Quick-mark: courseId → saving state
  const [quickSaving, setQuickSaving] = useState<string | null>(null);

  const TODAY      = new Date().toISOString().split("T")[0];
  const TODAY_DOW  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()];

  // Load settings from localStorage
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setSettingsForm(s);
  }, []);

  const saveSettings = () => {
    if (settingsForm.weeks < 1 || settingsForm.maxAbsences < 1)
      return toast.error("Values must be at least 1");
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsForm));
    setSettings({ ...settingsForm });
    setShowSettings(false);
    toast.success("Settings saved");
  };

  const updateCourseLimit = (courseId: string, val: string) => {
    const n = parseInt(val, 10);
    setSettingsForm(p => ({
      ...p,
      courseLimits: { ...p.courseLimits, [courseId]: isNaN(n) || n < 0 ? p.maxAbsences : n },
    }));
  };

  const load = async () => {
    if (!user) return;
    try {
      const [r, c] = await Promise.all([
        getAttendance(user.uid),
        getUserCourses(user.uid, profile?.classId),
      ]);
      setRecords(r);
      setCourses(c);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);

  // Only personal (non-official) courses can be self-marked by student
  const personalCourses = courses.filter(c => !c.isOfficial);
  const officialCourses = courses.filter(c => c.isOfficial);

  // Today's markable courses (personal + scheduled today)
  const todayCourses = (!profile?.classId ? courses : personalCourses)
    .filter(c => c.days?.includes(TODAY_DOW));

  const quickMark = async (courseId: string, status: AttendanceRecord["status"]) => {
    setQuickSaving(courseId);
    try {
      const exists = records.find(r => r.courseId === courseId && r.date === TODAY);
      if (exists) {
        await updateAttendance(exists.id, { status });
        toast.success("Updated!");
      } else {
        await markAttendance({ userId: user!.uid, courseId, date: TODAY, status, markedBy: user!.uid });
        toast.success(status === "present" ? "Marked present!" : status === "late" ? "Marked late!" : "Marked absent");
      }
      await load();
    } catch { toast.error("Failed"); }
    finally { setQuickSaving(null); }
  };

  const handleMark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId || !form.date) return toast.error("Please fill in all fields");
    const exists = records.find(r => r.courseId === form.courseId && r.date === form.date);
    setSaving(true);
    try {
      if (exists) {
        await updateAttendance(exists.id, { status: form.status });
        toast.success("Attendance updated!");
      } else {
        await markAttendance({
          userId: user!.uid, courseId: form.courseId,
          date: form.date, status: form.status, markedBy: user!.uid,
        });
        toast.success("Attendance marked!");
      }
      setShowModal(false);
      load();
    } catch { toast.error("Failed to mark attendance"); }
    finally { setSaving(false); }
  };

  // ── Derived stats ─────────────────────────────────────────
  const present = records.filter(r => r.status === "present").length;
  const absent  = records.filter(r => r.status === "absent").length;
  const late    = records.filter(r => r.status === "late").length;
  const rate    = records.length ? Math.round(((present + late) / records.length) * 100) : 0;

  // Min attendance rate from settings
  const minRate = Math.round(((settings.weeks - settings.maxAbsences) / settings.weeks) * 100);

  const courseStats = courses.map(c => {
    const cr       = records.filter(r => r.courseId === c.id);
    const cp       = cr.filter(r => r.status === "present").length;
    const cl       = cr.filter(r => r.status === "late").length;
    const absences = cr.filter(r => r.status === "absent").length;
    const cRate    = cr.length ? Math.round(((cp + cl) / cr.length) * 100) : null;
    const limit    = getCourseLimit(settings, c.id);
    const absLeft  = limit - absences;
    return {
      course: c, total: cr.length, present: cp, late: cl,
      absences, absLeft, limit, rate: cRate,
    };
  }).filter(x => x.total > 0);

  const danger  = courseStats.filter(x => x.absLeft <= 0);
  const warning = courseStats.filter(x => x.absLeft === 1);

  const sorted = [...records]
    .filter(r => courseFilter === "all" || r.courseId === courseFilter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getCourse = (id: string) => courses.find(c => c.id === id);

  const getSuggestedCoursesForDate = (dateStr: string) => {
    if (!dateStr) return [] as Course[];
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return [] as Course[];
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
    const availableCourses = !profile?.classId ? courses : personalCourses;
    return availableCourses.filter(course => course.days?.includes(day));
  };

  useEffect(() => {
    if (!showModal || !form.date) return;
    const suggested = getSuggestedCoursesForDate(form.date);
    if (!suggested.length) return;

    setForm(prev => {
      if (prev.courseId && suggested.some(course => course.id === prev.courseId)) return prev;
      return { ...prev, courseId: suggested[0].id };
    });
  }, [showModal, form.date, courses, personalCourses, profile?.classId]);

  const grouped = sorted.reduce<Record<string, AttendanceRecord[]>>((acc, r) => {
    const key = r.date.slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const monthLabel = (key: string) =>
    new Date(key + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <DashboardLayout>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-slate-900 leading-tight">Attendance</h1>
          <p className="text-[13px] text-slate-400 mt-1">
            {records.length} record{records.length !== 1 ? "s" : ""} · limit: {settings.maxAbsences} absence{settings.maxAbsences !== 1 ? "s" : ""} per {settings.weeks}-week semester
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSettingsForm(settings); setShowSettings(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border border-[#e8e4da] bg-white text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
            <Settings size={14} /> Limits
          </button>
          {(personalCourses.length > 0 || !profile?.classId) && (
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border border-[#e8e4da] bg-white text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
              <Plus size={15} /> Log Past Date
            </button>
          )}
        </div>
      </div>

      {/* ── Today's Classes (quick-mark) ───────────────────── */}
      {!loading && todayCourses.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e4da] mb-5 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f5f2ec]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(201,168,76,0.12)" }}>
                <CalendarCheck size={13} style={{ color: "#b98a2e" }} />
              </div>
              <p className="text-[13px] font-semibold text-slate-800">Today's Classes</p>
            </div>
            <p className="text-[11px] text-slate-400">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>

          <div className="divide-y divide-[#f8f5f0]">
            {todayCourses.map(course => {
              const todayRecord = records.find(r => r.courseId === course.id && r.date === TODAY);
              const currentStatus = todayRecord?.status;
              const isLoading = quickSaving === course.id;
              const absences = records.filter(r => r.courseId === course.id && r.status === "absent").length;
              const limit    = getCourseLimit(settings, course.id);
              const absLeft  = limit - absences;

              return (
                <div key={course.id} className="px-5 py-4 flex items-center gap-4">
                  {/* Course info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold px-2 py-0.5 rounded-lg"
                        style={{ background: "rgba(201,168,76,0.12)", color: "#b98a2e" }}>
                        {course.code}
                      </span>
                      <span className="text-[13px] font-medium text-slate-700 truncate">{course.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {course.startTime && (
                        <span className="text-[11px] text-slate-400">
                          {course.startTime} – {course.endTime}
                        </span>
                      )}
                      {course.room && (
                        <span className="text-[11px] text-slate-400">· {course.room}</span>
                      )}
                      {absLeft <= 1 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{
                            background: absLeft <= 0 ? "#fef2f2" : "#fffbeb",
                            color: absLeft <= 0 ? "#dc2626" : "#d97706",
                          }}>
                          {absLeft <= 0 ? "Limit hit!" : "1 absence left"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick-mark buttons */}
                  {isLoading ? (
                    <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin shrink-0" />
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(["present", "late", "absent"] as const).map(s => {
                        const cfg    = STATUS[s];
                        const Icon   = cfg.icon;
                        const active = currentStatus === s;
                        const wouldExceed = s === "absent" && absLeft <= 0 && !active;
                        return (
                          <button key={s} onClick={() => quickMark(course.id, s)}
                            title={cfg.label}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all active:scale-[0.95] border-2"
                            style={active ? {
                              background: s === "present" ? "#f0fdf4" : s === "late" ? "#fffbeb" : "#fef2f2",
                              borderColor: s === "present" ? "#16a34a" : s === "late" ? "#d97706" : "#dc2626",
                              color: s === "present" ? "#16a34a" : s === "late" ? "#d97706" : "#dc2626",
                            } : {
                              background: "#faf8f4",
                              borderColor: "#e8e4da",
                              color: wouldExceed ? "#dc2626" : "#94a3b8",
                              opacity: wouldExceed ? 1 : undefined,
                            }}>
                            <Icon size={13} />
                            <span className="hidden sm:inline">{cfg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stat row ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 stagger">
        <StatCard value={`${rate}%`} label="Attendance Rate"
          icon={rate >= minRate ? TrendingUp : TrendingDown}
          color={rateColor(rate, minRate)} bg={rate >= minRate ? "#f0fdf4" : "#fef2f2"} />
        <StatCard value={present} label="Present"  icon={CheckCircle2} color="#16a34a" bg="#f0fdf4" />
        <StatCard value={absent}  label="Absent"   icon={XCircle}      color="#dc2626" bg="#fef2f2" />
        <StatCard value={late}    label="Late"     icon={Clock}        color="#d97706" bg="#fffbeb" />
      </div>

      {/* ── Official course notice ─────────────────────────── */}
      {officialCourses.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border border-[#e8e4da] bg-white mb-4">
          <ShieldCheck size={15} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">
              {officialCourses.map(c => c.code).join(", ")}
            </span>
            {" "}— attendance for these courses is marked by your class representative. You can view records but cannot self-mark.
          </p>
        </div>
      )}

      {/* ── Danger: limit reached ──────────────────────────── */}
      {danger.length > 0 && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 px-5 py-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={14} className="text-red-600" />
            </div>
            <p className="text-sm font-bold text-red-800">Absence limit reached — you may have to repeat</p>
          </div>
          <div className="space-y-2">
            {danger.map(({ course, absences }) => (
              <div key={course.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-red-100">
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">
                    {course.code} <span className="text-slate-400 font-normal text-xs">{course.name}</span>
                  </p>
                  <p className="text-[11px] text-red-600 mt-0.5 font-medium">
                    {absences} absence{absences !== 1 ? "s" : ""} — limit of {settings.maxAbsences} reached
                  </p>
                </div>
                <span className="text-sm font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-xl">
                  {absences}/{settings.maxAbsences}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Warning: 1 absence left ────────────────────────── */}
      {warning.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={14} className="text-amber-600" />
            </div>
            <p className="text-sm font-semibold text-amber-800">1 absence left before limit</p>
          </div>
          <div className="space-y-2">
            {warning.map(({ course }) => (
              <div key={course.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100">
                <p className="text-[13px] font-semibold text-slate-800">
                  {course.code} <span className="text-slate-400 font-normal text-xs">{course.name}</span>
                </p>
                <span className="text-[12px] font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-xl">
                  1 left
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Overall progress bar ───────────────────────────── */}
      {records.length > 0 && (
        <div className="bg-white rounded-2xl px-5 py-4 border border-[#e8e4da] mb-4 card-lift">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[13px] font-semibold text-slate-700">Overall Attendance Rate</p>
            <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${rateBg(rate, minRate)}`}>
              {rate}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 relative">
            <div className="h-2 rounded-full transition-all duration-700"
              style={{ width: `${rate}%`, background: rateColor(rate, minRate) }} />
            {/* Min rate marker */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 opacity-40 rounded-full"
              style={{ left: `${minRate}%` }} />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-[11px] text-slate-400">{present + late} attended · {absent} missed</p>
            <p className="text-[11px] text-slate-400">Min required: {minRate}%</p>
          </div>
        </div>
      )}

      {/* ── Per-course absence tracker ─────────────────────── */}
      {courseStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e4da] mb-5 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f5f2ec] flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-800">Absence Tracker</p>
            <p className="text-[11px] text-slate-400">Default limit: {settings.maxAbsences}</p>
          </div>
          <div className="divide-y divide-[#f8f5f0]">
            {courseStats.map(({ course, absences, absLeft, limit, rate: r }) => {
              const pct     = Math.min((absences / limit) * 100, 100);
              const barColor = absLeft <= 0 ? "#dc2626" : absLeft === 1 ? "#d97706" : "#16a34a";
              const isOfficial = course.isOfficial;
              return (
                <div key={course.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-bold px-2 py-0.5 rounded-lg"
                        style={{ background: "rgba(201,168,76,0.12)", color: "#b98a2e" }}>
                        {course.code}
                      </span>
                      <span className="text-[12px] text-slate-500 truncate">{course.name}</span>
                      {isOfficial && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[#f5f2ec] text-slate-400 uppercase tracking-wide">
                          Official
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[11px] text-slate-400">
                        {absences}/{limit} absences
                        {limit !== settings.maxAbsences && (
                          <span className="ml-1 text-[10px] text-slate-300">(custom)</span>
                        )}
                      </span>
                      <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: absLeft <= 0 ? "#fef2f2" : absLeft === 1 ? "#fffbeb" : "#f0fdf4",
                          color: barColor,
                        }}>
                        {absLeft <= 0 ? "Limit hit" : `${absLeft} left`}
                      </span>
                    </div>
                  </div>

                  {/* Absence usage bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 mb-1">
                    <div className="h-2 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: barColor }} />
                  </div>

                  {/* Attendance rate sub-line */}
                  {r !== null && (
                    <p className="text-[11px] text-slate-400">
                      Attendance rate: <span className="font-semibold" style={{ color: rateColor(r, minRate) }}>{r}%</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Course filter pills ────────────────────────────── */}
      {courses.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {["all", ...courses.map(c => c.id)].map(id => {
            const label  = id === "all" ? "All" : (courses.find(c => c.id === id)?.code || id);
            const active = courseFilter === id;
            return (
              <button key={id} onClick={() => setCourseFilter(id)}
                className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-[0.97]"
                style={active
                  ? { background: "linear-gradient(135deg, #b98a2e, #a6731d)", color: "#fff" }
                  : { background: "#fff", color: "#64748b", border: "1px solid #e8e4da" }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Records ────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-[#e8e4da] animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
            <ClipboardList size={28} className="text-white/70" />
          </div>
          <p className="font-semibold text-slate-600">No attendance records yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {personalCourses.length > 0
              ? "Start tracking your attendance"
              : profile?.classId
              ? "Your class rep will mark attendance for official courses"
              : "Add courses on the Courses page to start tracking"}
          </p>
          {personalCourses.length > 0 && (
            <button onClick={() => setShowModal(true)}
              className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
              <Plus size={15} /> Mark First Attendance
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([month, recs]) => (
            <div key={month}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
                {monthLabel(month)}
              </p>
              <div className="bg-white rounded-2xl border border-[#e8e4da] overflow-hidden">
                <ul className="divide-y divide-[#f8f5f0]">
                  {recs.map(record => {
                    const cfg    = STATUS[record.status];
                    const Icon   = cfg.icon;
                    const course = getCourse(record.courseId);
                    const d      = new Date(record.date);
                    const isAdminMarked = course?.isOfficial;
                    return (
                      <li key={record.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#faf8f4] transition-colors">
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
                            {course && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg"
                                style={{ background: "rgba(201,168,76,0.12)", color: "#b98a2e" }}>
                                {course.code}
                              </span>
                            )}
                            <span className="text-[13px] font-medium text-slate-700 truncate">
                              {course?.name || "Unknown Course"}
                            </span>
                          </div>
                          {isAdminMarked && (
                            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <ShieldCheck size={9} /> Marked by class rep
                            </p>
                          )}
                        </div>

                        <span className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full ${cfg.badge}`}>
                          <Icon size={12} />
                          {cfg.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Log Past Date Modal ─────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "92vh" }}>

            {/* Header — fixed */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f5f2ec] shrink-0">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900">Log Past Attendance</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Record attendance for a previous date</p>
              </div>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Body — scrollable only if needed */}
            <form onSubmit={handleMark} className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Course *
                </label>
                <select value={form.courseId}
                  onChange={e => setForm(p => ({ ...p, courseId: e.target.value }))}
                  className={INPUT_CLS}>
                  <option value="">Select a course</option>
                  {(!profile?.classId ? courses : personalCourses).map(c => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>

                {(() => {
                  const suggested = getSuggestedCoursesForDate(form.date);
                  if (!suggested.length) return null;
                  const activeSuggestion = suggested.find(c => c.id === form.courseId) ?? suggested[0];
                  return (
                    <div className="mt-2 rounded-xl border border-[#f1e6c7] bg-[#fffaf0] px-3 py-2 text-[11px] text-[#8f6214]">
                      Suggested for this day: <span className="font-semibold">{activeSuggestion.code} — {activeSuggestion.name}</span>
                    </div>
                  );
                })()}

                {officialCourses.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                    <ShieldCheck size={10} /> Official courses are marked by your class rep.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Date *
                </label>
                <input type="date" value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className={INPUT_CLS} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  Status *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["present", "late", "absent"] as const).map(s => {
                    const cfg    = STATUS[s];
                    const Icon   = cfg.icon;
                    const active = form.status === s;
                    const courseAbsences = form.courseId
                      ? records.filter(r => r.courseId === form.courseId && r.status === "absent").length : 0;
                    const limit       = form.courseId ? getCourseLimit(settings, form.courseId) : settings.maxAbsences;
                    const wouldExceed = s === "absent" && courseAbsences >= limit;
                    return (
                      <button key={s} type="button"
                        onClick={() => setForm(p => ({ ...p, status: s }))}
                        className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-[12px] font-semibold transition-all active:scale-[0.97] ${
                          active ? `${cfg.bg} ${cfg.border} ${cfg.text}` : "bg-white border-[#e8e4da] text-slate-400 hover:bg-slate-50"
                        }`}>
                        <Icon size={20} className={active ? cfg.text : "text-slate-300"} />
                        {cfg.label}
                        {wouldExceed && s === "absent" && (
                          <span className="text-[9px] text-red-500 font-bold leading-none -mt-1">Limit!</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer buttons — always visible */}
              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Settings Modal ──────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "92vh" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f5f2ec] shrink-0">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900">Absence Limits</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Set per-course attendance rules</p>
              </div>
              <button onClick={() => setShowSettings(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex flex-col gap-5 px-6 py-5 overflow-y-auto">

              {/* Semester weeks */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Semester Length (weeks)
                </label>
                <input type="number" min="1" max="52" value={settingsForm.weeks}
                  onChange={e => setSettingsForm(p => ({ ...p, weeks: Number(e.target.value) }))}
                  className={INPUT_CLS} />
              </div>

              {/* Default limit */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Default Absence Limit
                </label>
                <input type="number" min="1" max="50" value={settingsForm.maxAbsences}
                  onChange={e => setSettingsForm(p => ({ ...p, maxAbsences: Number(e.target.value) }))}
                  className={INPUT_CLS} />
                <p className="text-[11px] text-slate-400 mt-1">Applied to any course without a custom limit</p>
              </div>

              {/* Per-course overrides */}
              {courses.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                    Per-Course Limits
                  </label>
                  <div className="space-y-2">
                    {courses.map(c => {
                      const val = settingsForm.courseLimits[c.id] ?? settingsForm.maxAbsences;
                      const isCustom = settingsForm.courseLimits[c.id] !== undefined
                        && settingsForm.courseLimits[c.id] !== settingsForm.maxAbsences;
                      return (
                        <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#e8e4da] bg-[#faf8f4]">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-slate-700 truncate">{c.code}</p>
                            <p className="text-[10px] text-slate-400 truncate">{c.name}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input type="number" min="0" max="50"
                              value={val}
                              onChange={e => updateCourseLimit(c.id, e.target.value)}
                              className="w-14 px-2 py-1.5 rounded-lg border border-[#e8e4da] text-[13px] font-semibold text-center outline-none focus:border-[#b98a2e] bg-white transition-all" />
                            <span className="text-[11px] text-slate-400">abs.</span>
                            {isCustom && (
                              <button onClick={() => setSettingsForm(p => {
                                const cl = { ...p.courseLimits };
                                delete cl[c.id];
                                return { ...p, courseLimits: cl };
                              })}
                                className="text-[10px] text-slate-400 hover:text-red-400 transition-colors ml-0.5">
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Each teacher may allow a different number of absences. Set them individually here.
                  </p>
                </div>
              )}

              {/* Preview */}
              <div className="rounded-2xl px-4 py-3 border border-[#e8e4da] bg-[#faf8f4]">
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  Default: need at least{" "}
                  <span className="font-bold text-slate-700">
                    {Math.round(((settingsForm.weeks - settingsForm.maxAbsences) / settingsForm.weeks) * 100)}%
                  </span>{" "}
                  attendance ({settingsForm.weeks - settingsForm.maxAbsences}/{settingsForm.weeks} classes).
                </p>
              </div>

              <div className="flex gap-2.5">
                <button onClick={() => setShowSettings(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
                  Cancel
                </button>
                <button onClick={saveSettings}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
