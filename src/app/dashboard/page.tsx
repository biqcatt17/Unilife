"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  getUserTasks, getUserCourses, getAttendance, getEvents,
  getUserGrades, getUserStudyLogs, getUserExpenses, getAnnouncements,
} from "@/lib/firestore";
import { Announcement } from "@/types";
import {
  BookOpen, CheckSquare, TrendingUp, Calendar,
  Clock, ArrowRight, Flame, Star, X,
  MapPin, ChevronRight, AlertTriangle, Wallet, BookMarked, Bell, GraduationCap,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import NotificationBanner, { useDashboardNotifications } from "@/components/ui/NotificationBanner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────
function pct(s: number, t: number) { return t > 0 ? (s / t) * 100 : 0; }


function calcStreak(logs: { date: string }[]) {
  const dates = new Set(logs.map(l => l.date));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().split("T")[0];
    if (!dates.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getWeekDays() {
  const today = new Date();
  const day   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return {
      date:  d.toISOString().split("T")[0],
      label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1),
    };
  });
}

// day-of-week index → short label matching Course.days format
const DOW_TO_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Progress ring ────────────────────────────────────────────
function Ring({ pct: p, size = 56, stroke = 5, color = "#3B82F6", trackColor = "#f1f5f9" }: {
  pct: number; size?: number; stroke?: number; color?: string; trackColor?: string;
}) {
  const r    = (size - stroke) / 2;
  const cx   = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (p / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ href, icon: Icon, value, label, color, loading }: {
  href: string; icon: React.ElementType; value: string | number;
  label: string; color: { text: string; bg: string; accent: string }; loading: boolean;
}) {
  return (
    <Link href={href}
      className="group relative paper-card p-4 card-lift transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color.bg }}>
          <Icon className="w-4 h-4" style={{ color: color.text }} />
        </div>
        <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
      </div>
      {loading ? (
        <div className="h-7 w-14 bg-slate-100 rounded animate-pulse mb-1" />
      ) : (
        <p className="text-[26px] font-bold leading-none mb-1 text-slate-900">{value}</p>
      )}
      <p className="text-[12px] text-slate-500 font-medium uppercase tracking-[0.14em]">{label}</p>
    </Link>
  );
}

// ─── Section card ─────────────────────────────────────────────
function Card({ title, href, linkLabel = "See all", icon: Icon, iconBg, iconColor, children, loading, skeleton }: {
  title: string; href: string; linkLabel?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  children: React.ReactNode; loading: boolean;
  skeleton?: React.ReactNode;
}) {
  return (
    <div className="paper-card p-5 card-lift">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
          </div>
          <h2 className="handwritten text-slate-800 text-[1.5rem] leading-none tracking-wide">{title}</h2>
        </div>
        <Link href={href} className="flex items-center gap-0.5 text-[11px] font-medium hover:underline" style={{ color: "#8b5e1b" }}>
          {linkLabel} <ArrowRight size={11} />
        </Link>
      </div>
      {loading ? (skeleton ?? <div className="space-y-2.5">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>) : children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);

  const [courses,       setCourses]       = useState<any[]>([]);
  const [tasks,         setTasks]         = useState<any[]>([]);
  const [attendance,    setAttendance]    = useState<any[]>([]);
  const [events,        setEvents]        = useState<any[]>([]);
  const [grades,        setGrades]        = useState<any[]>([]);
  const [studyLogs,     setStudyLogs]     = useState<any[]>([]);
  const [expenses,      setExpenses]      = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedAnn,  setDismissedAnn]  = useState<string | null>(null);
  const [joinCode,      setJoinCode]      = useState("");
  const [joining,       setJoining]       = useState(false);
  const [soloMode,      setSoloMode]      = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("unilife_solo_mode") === "1";
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [c, t, a, e, g, s, ex, ann] = await Promise.all([
          getUserCourses(user.uid, profile?.classId),
          getUserTasks(user.uid),
          getAttendance(user.uid),
          getEvents(),
          getUserGrades(user.uid),
          getUserStudyLogs(user.uid),
          getUserExpenses(user.uid),
          getAnnouncements(),
        ]);
        setCourses(c); setTasks(t); setAttendance(a);
        setEvents(e);  setGrades(g); setStudyLogs(s);
        setExpenses(ex); setAnnouncements(ann);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [user]);

  const weekDays      = getWeekDays();
  const today         = new Date().toISOString().split("T")[0];
  const todayDOW      = DOW_TO_DAY[new Date().getDay()];

  // ── Tasks ─────────────────────────────────────────────────
  const pendingTasks   = tasks.filter(t => t.status !== "completed");
  const overdueTasks   = pendingTasks.filter(t => t.dueDate < today);
  const upcomingTasks  = pendingTasks.filter(t => t.dueDate >= today).slice(0, 4);
  const completedCount = tasks.filter(t => t.status === "completed").length;
  const taskRate       = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;


  // ── Attendance ────────────────────────────────────────────
  const present        = attendance.filter(a => a.status === "present").length;
  const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;

  // ── Events ────────────────────────────────────────────────
  const upcoming = events.filter(e => new Date(e.eventDate) >= new Date());

  // ── Grades ────────────────────────────────────────────────
  const allPcts  = grades.map(g => pct(g.score, g.total));
  const avgGrade = allPcts.length ? allPcts.reduce((s, p) => s + p, 0) / allPcts.length : null;

  // ── Study ─────────────────────────────────────────────────
  const weekStudyHours = weekDays.reduce((sum, d) =>
    sum + studyLogs.filter(l => l.date === d.date).reduce((s: number, l: any) => s + l.hours, 0), 0);
  const todayStudy  = studyLogs.filter(l => l.date === today).reduce((s: number, l: any) => s + l.hours, 0);
  const studyStreak = calcStreak(studyLogs);
  const weeklyStudyProgress = Math.min((weekStudyHours / 20) * 100, 100);
  const productivitySummary = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;

  const studyChartData = weekDays.map(d => ({
    day:   d.label,
    hours: parseFloat(studyLogs.filter(l => l.date === d.date).reduce((s: number, l: any) => s + l.hours, 0).toFixed(1)),
    today: d.date === today,
  }));

  // ── Today's classes ───────────────────────────────────────
  const todayClasses = courses
    .filter(c => c.days?.includes(todayDOW))
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const selfMarkTodayClasses = todayClasses.filter(course => !course.isOfficial);
  const nextClass = todayClasses[0] ?? null;
  const todayTasks = tasks.filter(task => task.dueDate === today && task.status !== "completed");
  const unmarkedTodayCourses = selfMarkTodayClasses.filter(course =>
    !attendance.some(record => record.courseId === course.id && record.date === today)
  );
  const attendanceReminderCourses = unmarkedTodayCourses.slice(0, 2);

  // ── Finance ───────────────────────────────────────────────
  const thisMonth     = today.slice(0, 7); // "YYYY-MM"
  const monthExpenses = expenses.filter(e => e.expenseDate?.startsWith(thisMonth));
  const totalSpent    = monthExpenses.reduce((s: number, e: any) => s + (e.amountUSD ?? 0), 0);
  const budget        = profile?.monthlyBudgetUSD ?? 0;
  const budgetPct     = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;
  const budgetColor   = budgetPct >= 90 ? "#dc2626" : budgetPct >= 70 ? "#d97706" : "#16a34a";

  // ── Insight ───────────────────────────────────────────────
  useDashboardNotifications(tasks, events);

  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.displayName?.split(" ")[0] || "Student";
  const dateStr   = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ── Join class ────────────────────────────────────────────
  const handleJoinClass = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const { getAuth } = await import("firebase/auth");
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      if (res.status === 404) { toast.error("Invalid join code — check with your class rep."); return; }
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Failed to join"); return; }
      toast.success("Joined! Refreshing your dashboard…");
      window.location.reload();
    } catch { toast.error("Something went wrong"); }
    finally { setJoining(false); }
  };

  const insight = (() => {
    if (overdueTasks.length > 0)           return { text: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""} — take care of them first.` };
    if (studyStreak >= 7)                   return { text: `${studyStreak}-day study streak. Keep it going.` };
    if (attendanceRate < 70 && attendance.length > 3) return { text: "Attendance is below 70% — try to attend more classes." };
    if (pendingTasks.length > 5)            return { text: `${pendingTasks.length} tasks pending. Let's tackle some today.` };
    if (avgGrade !== null && avgGrade >= 80) return { text: `Grade average is ${avgGrade.toFixed(1)}% — great work.` };
    return { text: "Track grades, study sessions, and tasks to stay on top." };
  })();

  return (
    <DashboardLayout>
      <NotificationBanner />

      {/* ── Greeting ──────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-[13px] text-slate-500 mb-1 uppercase tracking-[0.18em]">{greeting} · {dateStr}</p>
          <h1 className="text-[3rem] leading-none text-slate-900 handwritten">{firstName}</h1>
          <p className="text-[13px] text-slate-500 mt-1 max-w-md">{insight.text}</p>
        </div>
        {!loading && (
          <div className="flex items-center gap-2.5 paper-card px-4 py-2.5 self-start border border-[#e4e4dc] rounded-2xl">
            <Clock size={14} className="text-slate-400" />
            <div>
              <p className="text-slate-900 font-bold text-base leading-none">{todayStudy.toFixed(1)}h</p>
              <p className="text-slate-400 text-[11px] mt-0.5">studied today</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Admin setup banner ────────────────────────────── */}
      {!loading && profile?.role === "admin" && !profile?.classId && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-slate-200 bg-[#f5f3ea] flex-wrap paper-card">
          <GraduationCap size={16} className="text-slate-500 shrink-0" />
          <p className="text-sm text-slate-600 flex-1">Class not set up yet. Create your class so students can join.</p>
          <a href="/admin" className="text-sm font-medium text-slate-900 hover:underline shrink-0">Go to Admin Panel →</a>
        </div>
      )}

      {/* ── No-class banner ───────────────────────────────── */}
      {!loading && !profile?.classId && profile?.role !== "admin" && !soloMode && (
        <div className="mb-5 flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-[#e4e4dc] bg-[#fffdf8] flex-wrap paper-card">
          <GraduationCap size={16} className="text-slate-400 shrink-0" />
          <p className="text-sm text-slate-600 flex-1">You're not in a class yet. Enter your join code to get started.</p>
          <form onSubmit={handleJoinClass} className="flex gap-2 shrink-0">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Join code"
              maxLength={8}
              className="paper-input w-28 px-3 py-1.5 text-sm font-mono uppercase tracking-widest"
            />
            <button type="submit" disabled={joining || !joinCode.trim()}
              className="paper-button px-3 py-1.5 text-white text-sm font-medium transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" }}>
              {joining ? "…" : "Join"}
            </button>
          </form>
          <button onClick={() => { setSoloMode(true); localStorage.setItem("unilife_solo_mode", "1"); }}
            className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Announcement banner ───────────────────────────── */}
      {!loading && (() => {
        const ann = announcements.find(a => a.pinned) ?? announcements[0];
        if (!ann || dismissedAnn === ann.id) return null;
        return (
          <div className="flex items-start gap-3 mb-5 px-4 py-3 rounded-2xl border border-blue-100 bg-[#edf5ff] paper-card">
            <Bell size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900">{ann.title}</p>
              <p className="text-xs text-blue-600 mt-0.5 line-clamp-2">{ann.body}</p>
            </div>
            <button onClick={() => setDismissedAnn(ann.id)} className="text-blue-300 hover:text-blue-500 text-xs shrink-0 mt-0.5">✕</button>
          </div>
        );
      })()}

      {/* ── Overdue alert ─────────────────────────────────── */}
      {!loading && overdueTasks.length > 0 && (
        <Link href="/tasks"
          className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl border border-red-200 bg-[#fff0ee] hover:bg-red-100 transition-colors paper-card">
          <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-red-500 mt-0.5 truncate">
              {overdueTasks.slice(0, 2).map(t => t.title).join(" · ")}
              {overdueTasks.length > 2 ? ` · +${overdueTasks.length - 2} more` : ""}
            </p>
          </div>
          <ChevronRight size={16} className="text-red-400 shrink-0" />
        </Link>
      )}

      {!loading && (
        <div className="mb-6 paper-card rounded-3xl p-4 md:p-5 border border-[#e8e4da] bg-[linear-gradient(135deg,#fffdf8_0%,#fffaf1_100%)]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Today</p>
              <h2 className="text-[1.5rem] font-bold text-slate-800 leading-none mt-1">Your day</h2>
            </div>
            <div className="rounded-full border border-[#eadfc1] bg-[#fff9ee] px-2.5 py-1 text-[11px] font-semibold text-[#8b5e1b]">
              {todayClasses.length} class{todayClasses.length === 1 ? "" : "es"}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-[#E9E3D4] bg-white/85 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-2">Next class</p>
              {nextClass ? (
                <>
                  <p className="text-[15px] font-bold text-slate-800 truncate">{nextClass.name}</p>
                  <p className="text-[12px] text-slate-500 mt-1">
                    {nextClass.startTime} – {nextClass.endTime}
                  </p>
                  {nextClass.room && <p className="text-[11px] text-slate-400 mt-1">{nextClass.room}</p>}
                </>
              ) : (
                <p className="text-sm text-slate-500">No class scheduled.</p>
              )}
            </div>

            <div className="rounded-2xl border border-[#E9E3D4] bg-white/85 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-2">Attendance</p>
              {unmarkedTodayCourses.length > 0 ? (
                <>
                  <p className="text-[15px] font-bold text-amber-700">{unmarkedTodayCourses.length} left</p>
                  <p className="text-[12px] text-slate-500 mt-1 truncate">
                    {attendanceReminderCourses.map(c => c.code).join(" · ")}
                    {unmarkedTodayCourses.length > attendanceReminderCourses.length ? ` +${unmarkedTodayCourses.length - attendanceReminderCourses.length}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-bold text-emerald-600">All set</p>
                  <p className="text-[12px] text-slate-500 mt-1">No self-mark classes left today.</p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#E9E3D4] bg-white/85 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-2">Tasks</p>
              {todayTasks.length > 0 ? (
                <>
                  <p className="text-[15px] font-bold text-slate-800">{todayTasks.length} due</p>
                  <p className="text-[12px] text-slate-500 mt-1 truncate">{todayTasks[0].title}</p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-bold text-emerald-600">Clear</p>
                  <p className="text-[12px] text-slate-500 mt-1">No tasks due today.</p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/attendance" className="inline-flex items-center gap-1.5 rounded-full bg-[#b98a2e] px-3 py-1.5 text-[12px] font-semibold text-white hover:brightness-110 transition-all">
              Log attendance <ChevronRight size={12} />
            </Link>
            <Link href="/timetable" className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e4da] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-all">
              Timetable
            </Link>
            <Link href="/tasks" className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e4da] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-all">
              Tasks
            </Link>
          </div>
        </div>
      )}

      {!loading && (
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr] gap-4">
          <div className="paper-card rounded-3xl p-4 md:p-5 border border-[#e8e4da] bg-[linear-gradient(135deg,#faf7f1_0%,#f7f2ea_100%)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Flame size={15} className="text-violet-600" />
                </div>
                <h3 className="text-[1.05rem] font-bold text-slate-800">Study streak</h3>
              </div>
              <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                {studyStreak} day{studyStreak === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/90 border border-[#eee5d7] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Today</p>
                <p className="mt-2 text-[26px] font-bold text-slate-800 leading-none">{todayStudy.toFixed(1)}h</p>
                <p className="text-[11px] text-slate-400 mt-1">study time</p>
              </div>
              <div className="rounded-2xl bg-white/90 border border-[#eee5d7] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">This week</p>
                <p className="mt-2 text-[26px] font-bold text-slate-800 leading-none">{weekStudyHours.toFixed(1)}h</p>
                <p className="text-[11px] text-slate-400 mt-1">target 20h</p>
              </div>
            </div>
          </div>

          <div className="paper-card rounded-3xl p-4 md:p-5 border border-[#e8e4da] bg-[linear-gradient(135deg,#fffdf8_0%,#fffaf3_100%)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <TrendingUp size={15} className="text-emerald-600" />
                </div>
                <h3 className="text-[1.05rem] font-bold text-slate-800">Productivity</h3>
              </div>
              <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                {productivitySummary}%
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
                  <span>Weekly goal</span>
                  <span>{Math.round(weeklyStudyProgress)}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400" style={{ width: `${weeklyStudyProgress}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/90 border border-[#eee5d7] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Tasks</p>
                  <p className="mt-2 text-[24px] font-bold text-slate-800 leading-none">{completedCount}</p>
                  <p className="text-[11px] text-slate-400 mt-1">done</p>
                </div>
                <div className="rounded-2xl bg-white/90 border border-[#eee5d7] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Focus</p>
                  <p className="mt-2 text-[24px] font-bold text-slate-800 leading-none">{Math.round(todayStudy * 60)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">mins</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && selfMarkTodayClasses.length > 0 && unmarkedTodayCourses.length > 0 && (
        <Link href="/attendance"
          className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl border border-amber-200 bg-[#fffaf0] hover:bg-[#fff3d7] transition-colors paper-card">
          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Bell size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Attendance reminder
            </p>
            <p className="text-xs text-amber-700 mt-0.5 truncate">
              {attendanceReminderCourses.map(course => course.code).join(" · ")}
              {unmarkedTodayCourses.length > attendanceReminderCourses.length ? ` · +${unmarkedTodayCourses.length - attendanceReminderCourses.length} more` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-amber-700 text-xs font-semibold">
            Log now <ChevronRight size={13} />
          </div>
        </Link>
      )}

      {/* ── Top stat row ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger">
        <StatCard href="/courses"    icon={BookOpen}    value={loading ? "—" : courses.length}        label="Courses"         loading={loading}
          color={{ text: "#2563eb", bg: "#eff6ff", accent: "linear-gradient(90deg,#3b82f6,#6366f1)" }} />
        <StatCard href="/tasks"      icon={CheckSquare} value={loading ? "—" : pendingTasks.length}   label="Pending Tasks"   loading={loading}
          color={{ text: "#d97706", bg: "#fffbeb", accent: "linear-gradient(90deg,#f59e0b,#fb923c)" }} />
        <StatCard href="/attendance" icon={TrendingUp}  value={loading ? "—" : `${attendanceRate}%`}  label="Attendance Rate" loading={loading}
          color={{ text: "#16a34a", bg: "#f0fdf4", accent: "linear-gradient(90deg,#22c55e,#10b981)" }} />
        <StatCard href="/grades"     icon={Star}        value={loading ? "—" : (avgGrade !== null ? `${avgGrade.toFixed(0)}%` : "—")} label="Avg Grade" loading={loading}
          color={{ text: "#7c3aed", bg: "#f5f3ff", accent: "linear-gradient(90deg,#8b5cf6,#a78bfa)" }} />
      </div>

      {/* ── Middle row: Today's Classes + Study Chart ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Today's Classes */}
        <Card title="Today's Classes" href="/timetable" linkLabel="Timetable"
          icon={BookMarked} iconBg="bg-blue-50" iconColor="text-blue-600" loading={loading}>
          {todayClasses.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm font-medium text-slate-500">No classes today</p>
              <p className="text-xs text-slate-400 mt-0.5">Enjoy your free day</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {todayClasses.map((course: any) => (
                <li key={course.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
                  <div className="w-1.5 h-10 rounded-full shrink-0" style={{ background: "linear-gradient(180deg,#3b82f6,#6366f1)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{course.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {course.startTime && course.endTime ? `${course.startTime} – ${course.endTime}` : "Time TBD"}
                      {course.room ? ` · ${course.room}` : ""}
                    </p>
                  </div>
                  {course.code && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 shrink-0">
                      {course.code}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Study hours bar chart */}
        <Card title="Study Hours This Week" href="/study" linkLabel="Study Log"
          icon={Clock} iconBg="bg-violet-50" iconColor="text-violet-600" loading={loading}>
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className="text-[28px] font-bold text-violet-600 leading-none">{weekStudyHours.toFixed(1)}</span>
              <span className="text-xs text-slate-400 ml-1">hrs this week</span>
            </div>
            {studyStreak > 0 && (
              <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-xl">
                <Flame size={13} className="text-orange-500" />
                <span className="text-sm font-bold text-orange-600">{studyStreak}d</span>
                <span className="text-[11px] text-orange-400">streak</span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={studyChartData} barSize={24} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(v) => [`${v}h`, "Study"]}
              />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}
                shape={(props: any) => {
                  const { x, y, width, height, today } = props;
                  return <rect x={x} y={y} width={width} height={height}
                    rx={4} fill={today ? "#7c3aed" : "#c4b5fd"} />;
                }} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-700"
              style={{ width: `${Math.min((weekStudyHours / 20) * 100, 100)}%` }} />
          </div>
          <p className="text-[11px] text-slate-400 mt-1 text-right">{weekStudyHours.toFixed(1)} / 20h goal</p>
        </Card>
      </div>

      {/* ── Bottom row ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Upcoming Tasks */}
        <Card title="Upcoming Tasks" href="/tasks" icon={CheckSquare}
          iconBg="bg-green-50" iconColor="text-green-600" loading={loading}>
          {upcomingTasks.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm text-slate-500">No pending tasks</p>
              <Link href="/tasks" className="text-xs font-medium hover:underline mt-1" style={{ color: "#b98a2e" }}>Add a task</Link>
            </div>
          ) : (
            <ul className="space-y-1">
              {upcomingTasks.map((task: any) => {
                const dueToday = task.dueDate === today;
                const dueTmrw  = task.dueDate === (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })();
                return (
                  <li key={task.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dueToday ? "bg-orange-400" : "bg-slate-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-800 truncate">{task.title}</p>
                      <p className={`text-[11px] mt-0.5 ${dueToday ? "text-orange-500 font-medium" : dueTmrw ? "text-amber-500" : "text-slate-400"}`}>
                        {dueToday ? "Due today" : dueTmrw ? "Due tomorrow" : `Due ${task.dueDate}`}
                      </p>
                    </div>
                    {task.priority === "high" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">high</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Progress bar */}
          {!loading && tasks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-50">
              <div className="flex justify-between text-[11px] text-slate-400 mb-1.5">
                <span>Overall completion</span>
                <span>{completedCount}/{tasks.length} · {taskRate}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                  style={{ width: `${taskRate}%` }} />
              </div>
            </div>
          )}
        </Card>

        {/* Finance widget */}
        <Card title="Finance This Month" href="/finance" linkLabel="Finance"
          icon={Wallet} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading}>
          {budget === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm text-slate-500">No budget set</p>
              <Link href="/profile" className="text-xs font-medium hover:underline mt-1" style={{ color: "#b98a2e" }}>Set monthly budget</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Donut-style ring */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <Ring pct={budgetPct} size={76} stroke={7} color={budgetColor} trackColor="#f1f5f9" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[12px] font-bold text-slate-700">{Math.round(budgetPct)}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-[28px] font-bold leading-none" style={{ color: budgetColor }}>
                    ${totalSpent.toFixed(0)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">of ${budget} budget</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: budgetColor }}>
                    ${Math.max(budget - totalSpent, 0).toFixed(0)} remaining
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all duration-700"
                    style={{ width: `${budgetPct}%`, background: budgetColor }} />
                </div>
                <p className="text-[11px] text-slate-400">
                  {monthExpenses.length} expense{monthExpenses.length !== 1 ? "s" : ""} this month
                </p>
              </div>
              {budgetPct >= 80 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50">
                  <AlertTriangle size={13} className="text-red-500 shrink-0" />
                  <p className="text-[12px] text-red-600 font-medium">
                    {budgetPct >= 100 ? "Budget exceeded!" : "Approaching budget limit"}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Upcoming Events */}
        <Card title="Upcoming Events" href="/events" icon={Calendar}
          iconBg="bg-purple-50" iconColor="text-purple-600" loading={loading}>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm text-slate-500">No upcoming events</p>
              <Link href="/events" className="text-xs font-medium hover:underline mt-1" style={{ color: "#b98a2e" }}>Browse events</Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 3).map((event: any) => (
                <li key={event.id} className="flex gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 text-white"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#6366f1)" }}>
                    <span className="text-[8px] font-bold uppercase opacity-80">
                      {new Date(event.eventDate).toLocaleString("default", { month: "short" })}
                    </span>
                    <span className="text-[15px] font-bold leading-tight">
                      {new Date(event.eventDate).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 self-center">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{event.title}</p>
                    {event.location && (
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                        <MapPin size={10} className="shrink-0" /> {event.location}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

    </DashboardLayout>
  );
}
