"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Announcement, Course, AttendanceRecord, Class, Event } from "@/types";
import {
  ShieldCheck, Megaphone, Trash2, Pin, Users, Calendar,
  Bell, BookOpen, Plus, ChevronDown, ChevronUp, X, Copy, GraduationCap,
  ClipboardCheck, UserMinus, TrendingUp, MapPin, Clock, CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Auth fetch helper ────────────────────────────────────────
async function apiFetch(path: string, options?: RequestInit) {
  const { getAuth } = await import("firebase/auth");
  const token = await getAuth().currentUser?.getIdToken();
  return fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  });
}

// ─── Constants ───────────────────────────────────────────────
const DAYS    = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const COLORS  = ["blue","violet","green","amber","rose","teal","orange","pink"];

const BLANK_COURSE = {
  name: "", code: "", instructor: "", room: "",
  startTime: "08:00", endTime: "09:30",
  days: [] as string[], color: "blue", description: "",
};

type Tab = "announcements" | "courses" | "attendance" | "students" | "events";

// ─── Attendance status badge ──────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent:  "bg-red-100 text-red-700",
  late:    "bg-amber-100 text-amber-700",
};

// ─── Page ────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab]                         = useState<Tab>("announcements");
  const [announcements, setAnnouncements]     = useState<Announcement[]>([]);
  const [officialCourses, setOfficialCourses] = useState<Course[]>([]);
  const [stats, setStats]                     = useState({ students: 0, events: 0 });
  const [loading, setLoading]                 = useState(true);
  const [myClass, setMyClass]                 = useState<Class | null>(null);
  const [classLoading, setClassLoading]       = useState(true);

  // Class creation form
  const [classForm, setClassForm]   = useState({ name: "", major: "", joinCode: "" });
  const [classSaving, setClassSaving] = useState(false);

  // Announcement form
  const [annForm, setAnnForm]   = useState({ title: "", body: "", pinned: false });
  const [annSaving, setAnnSaving] = useState(false);

  // Course form
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm]         = useState(BLANK_COURSE);
  const [courseSaving, setCourseSaving]     = useState(false);

  // Attendance
  const [selectedCourse, setSelectedCourse]   = useState<string>("");
  const [attendanceRecs, setAttendanceRecs]   = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers]               = useState<Record<string, string>>({}); // uid → displayName
  const [attLoading, setAttLoading]           = useState(false);
  const [markDate, setMarkDate]               = useState(new Date().toISOString().slice(0, 10));
  const [markMode, setMarkMode]               = useState(false);
  const [markStatuses, setMarkStatuses]       = useState<Record<string, "present"|"absent"|"late">>({});
  const [markSaving, setMarkSaving]           = useState(false);

  // Students
  const [allStudents, setAllStudents]         = useState<any[]>([]);
  const [roleUpdating, setRoleUpdating]       = useState<string | null>(null);
  const [studentSearch, setStudentSearch]     = useState("");

  // Events
  const [classEvents, setClassEvents]         = useState<Event[]>([]);
  const [eventForm, setEventForm]             = useState({ title: "", description: "", eventDate: "", eventTime: "", location: "" });
  const [eventSaving, setEventSaving]         = useState(false);
  const [showEventForm, setShowEventForm]     = useState(false);

  // Approved request pre-fill
  const [approvedRequest, setApprovedRequest] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && profile && profile.role !== "admin") router.replace("/dashboard");
  }, [authLoading, profile, router]);

  const loadClass = async () => {
    setClassLoading(true);
    try {
      const res = await apiFetch("/api/classes");
      const data = res.ok ? await res.json() : null;
      setMyClass(data);
      // If no class yet, fetch approved request to pre-fill the form
      if (!data) {
        const rRes = await apiFetch("/api/admin-requests/my");
        if (rRes.ok) {
          const reqs = await rRes.json();
          const approved = reqs.find((r: any) => r.status === "approved");
          if (approved) {
            setApprovedRequest(approved);
            setClassForm({ name: approved.className, major: approved.major, joinCode: "" });
          }
        }
      }
    } catch { setMyClass(null); }
    finally { setClassLoading(false); }
  };

  const load = async () => {
    try {
      const [aRes, eRes, uRes, cRes] = await Promise.all([
        apiFetch("/api/announcements"),
        apiFetch("/api/events"),
        apiFetch("/api/users"),
        apiFetch("/api/courses/official"),
      ]);
      const [a, e, u, c] = await Promise.all([
        aRes.ok ? aRes.json() : [],
        eRes.ok ? eRes.json() : [],
        uRes.ok ? uRes.json() : [],
        cRes.ok ? cRes.json() : [],
      ]);
      setAnnouncements(Array.isArray(a) ? a : []);
      setOfficialCourses(Array.isArray(c) ? c : []);
      const events = (Array.isArray(e) ? e : []).filter((ev: any) => ev.isClassWide);
      setClassEvents(events);
      const users = Array.isArray(u) ? u : [];
      setAllStudents(users);
      setStats({ students: users.length, events: Array.isArray(e) ? e.length : 0 });
      if (users.length) {
        const map: Record<string, string> = {};
        users.forEach((user: any) => { map[user.uid] = user.displayName || user.email || user.uid; });
        setAllUsers(map);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user) { loadClass(); load(); } }, [user]);

  // ── Load attendance for selected course ───────────────────
  useEffect(() => {
    if (!selectedCourse) { setAttendanceRecs([]); return; }
    setAttLoading(true);
    apiFetch(`/api/admin/attendance?courseId=${selectedCourse}`)
      .then(r => r.json())
      .then(d => setAttendanceRecs(Array.isArray(d) ? d : []))
      .catch(() => setAttendanceRecs([]))
      .finally(() => setAttLoading(false));
  }, [selectedCourse]);

  // ── Announcement handlers ─────────────────────────────────
  const handlePostAnn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annForm.title.trim() || !annForm.body.trim()) return toast.error("Title and body are required");
    setAnnSaving(true);
    try {
      const res = await apiFetch("/api/announcements", { method: "POST", body: JSON.stringify(annForm) });
      if (!res.ok) throw new Error();
      toast.success("Announcement posted!");
      setAnnForm({ title: "", body: "", pinned: false });
      load();
    } catch { toast.error("Failed to post"); }
    finally { setAnnSaving(false); }
  };

  const handleDeleteAnn = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await apiFetch(`/api/announcements/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch { toast.error("Failed to delete"); }
  };

  // ── Course handlers ───────────────────────────────────────
  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.name || !courseForm.code) return toast.error("Name and code are required");
    if (!courseForm.days.length) return toast.error("Select at least one day");
    setCourseSaving(true);
    try {
      const res = await apiFetch("/api/courses", {
        method: "POST",
        body: JSON.stringify({ ...courseForm, isOfficial: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Course added!");
      setCourseForm(BLANK_COURSE);
      setShowCourseForm(false);
      load();
    } catch { toast.error("Failed to add course"); }
    finally { setCourseSaving(false); }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm("Delete this official course? Students will no longer see it.")) return;
    try {
      const res = await apiFetch(`/api/courses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Course deleted");
      setOfficialCourses(prev => prev.filter(c => c.id !== id));
    } catch { toast.error("Failed to delete"); }
  };

  // ── Create class ─────────────────────────────────────────
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classForm.name.trim() || !classForm.major.trim()) return toast.error("Name and major are required");
    setClassSaving(true);
    try {
      const res = await apiFetch("/api/classes", {
        method: "POST",
        body: JSON.stringify(classForm),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to create class"); return; }
      toast.success(`Class created! Join code: ${data.joinCode}`);
      loadClass();
      load();
    } catch { toast.error("Failed to create class"); }
    finally { setClassSaving(false); }
  };

  // ── Class-wide events ─────────────────────────────────────
  const handlePostEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title.trim() || !eventForm.eventDate) return toast.error("Title and date are required");
    setEventSaving(true);
    try {
      const res = await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ ...eventForm, isClassWide: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Event posted to class!");
      setEventForm({ title: "", description: "", eventDate: "", eventTime: "", location: "" });
      setShowEventForm(false);
      load();
    } catch { toast.error("Failed to post event"); }
    finally { setEventSaving(false); }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      await apiFetch(`/api/events/${id}`, { method: "DELETE" });
      toast.success("Event deleted");
      setClassEvents(prev => prev.filter(ev => ev.id !== id));
    } catch { toast.error("Failed to delete event"); }
  };

  // ── Admin mark attendance ─────────────────────────────────
  const handleMarkAttendance = async () => {
    if (!selectedCourse || !markDate) return;
    const records = allStudents.map(s => ({ userId: s.uid, status: markStatuses[s.uid] ?? "absent" }));
    setMarkSaving(true);
    try {
      const res = await apiFetch("/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({ courseId: selectedCourse, date: markDate, records }),
      });
      if (!res.ok) throw new Error();
      toast.success("Attendance saved!");
      setMarkMode(false);
      // Refresh attendance records
      const r = await apiFetch(`/api/admin/attendance?courseId=${selectedCourse}`);
      const d = await r.json();
      setAttendanceRecs(Array.isArray(d) ? d : []);
    } catch { toast.error("Failed to save attendance"); }
    finally { setMarkSaving(false); }
  };

  // ── Remove from class ─────────────────────────────────────
  const handleRemoveFromClass = async (targetUid: string, name: string) => {
    if (!confirm(`Remove ${name} from your class? They will lose access to class resources.`)) return;
    setRoleUpdating(targetUid);
    try {
      const res = await apiFetch("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ targetUid, action: "remove" }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${name} removed from class`);
      setAllStudents(prev => prev.filter(u => u.uid !== targetUid));
    } catch { toast.error("Failed to remove student"); }
    finally { setRoleUpdating(null); }
  };

  // ── Role toggle ───────────────────────────────────────────
  const handleToggleRole = async (targetUid: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "student" : "admin";
    const label   = newRole === "admin" ? "promote to admin" : "demote to student";
    if (!confirm(`Are you sure you want to ${label} this user?`)) return;
    setRoleUpdating(targetUid);
    try {
      const res = await apiFetch("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ targetUid, role: newRole }),
      });
      if (!res.ok) throw new Error();
      toast.success(`User ${newRole === "admin" ? "promoted to admin" : "demoted to student"}`);
      setAllStudents(prev => prev.map(u => u.uid === targetUid ? { ...u, role: newRole } : u));
    } catch { toast.error("Failed to update role"); }
    finally { setRoleUpdating(null); }
  };

  const toggleDay = (d: string) =>
    setCourseForm(p => ({
      ...p,
      days: p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d],
    }));

  if (authLoading || !profile) return null;
  if (profile.role !== "admin") return null;

  // ── No class yet — onboarding wizard ────────────────────
  if (!classLoading && !myClass) {
    const firstName = profile.displayName?.split(" ")[0] || "there";
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto mt-10">

          {/* Welcome header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" }}>
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome, {firstName}!</h1>
            <p className="text-slate-500 text-sm mt-1.5 max-w-xs mx-auto">
              You've been approved as a Class Rep. Set up your class to unlock all admin features.
            </p>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-0 mb-8 px-2">
            {[
              { n: 1, label: "Create class" },
              { n: 2, label: "Share join code" },
              { n: 3, label: "Add courses" },
            ].map((step, i) => (
              <div key={step.n} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step.n !== 1 ? "bg-slate-100 text-slate-400" : "text-white"
                  }`}
                  style={step.n === 1 ? { background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" } : undefined}
                  >{step.n}</div>
                  <p className={`text-[11px] mt-1 font-medium ${step.n === 1 ? "text-slate-700" : "text-slate-400"}`}>{step.label}</p>
                </div>
                {i < 2 && <div className="w-full h-px bg-slate-200 mb-5 mx-1" />}
              </div>
            ))}
          </div>

          {/* Pre-fill notice */}
          {approvedRequest && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-100 mb-4">
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800">Pre-filled from your approved application</p>
                <p className="text-xs text-green-600 mt-0.5">Review the details below and adjust if needed.</p>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="bg-white rounded-2xl border border-[#e4e4dc] p-6 shadow-sm">
            <form onSubmit={handleCreateClass} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Input label="Class Name *" placeholder="e.g. Computer Science — Batch 2024"
                  value={classForm.name} onChange={e => setClassForm(p => ({ ...p, name: e.target.value }))} />
                <p className="text-xs text-slate-400">Use a name your students will recognise.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Input label="Major / Faculty *" placeholder="e.g. Computer Science"
                  value={classForm.major} onChange={e => setClassForm(p => ({ ...p, major: e.target.value }))} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Join Code <span className="text-slate-400 font-normal">(optional)</span></label>
                <input placeholder="Leave blank to auto-generate"
                  value={classForm.joinCode} onChange={e => setClassForm(p => ({ ...p, joinCode: e.target.value.toUpperCase() }))}
                  maxLength={8}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.12)] uppercase tracking-widest font-mono" />
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-50">
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-500">
                    Students paste this code on the dashboard or Profile page to join your class. You can share it anytime from the Admin Panel.
                  </p>
                </div>
              </div>

              <Button type="submit" loading={classSaving} fullWidth>
                Create Class &amp; Get Join Code →
              </Button>
            </form>
          </div>

          {/* What's next hint */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { icon: Users,     title: "Students join",    desc: "Share the join code so classmates can join" },
              { icon: BookOpen,  title: "Add courses",      desc: "Post official courses from the Courses tab"  },
              { icon: Bell,      title: "Post updates",     desc: "Announce deadlines and events to your class" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-xl border border-[#e4e4dc] p-3 text-center">
                <Icon className="w-4 h-4 text-slate-400 mx-auto mb-2" />
                <p className="text-[12px] font-semibold text-slate-700">{title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Attendance summary per student ────────────────────────
  const selectedCourseName = officialCourses.find(c => c.id === selectedCourse)?.name ?? "";
  const byStudent = Object.entries(
    attendanceRecs.reduce<Record<string, AttendanceRecord[]>>((acc, r) => {
      (acc[r.userId] ??= []).push(r);
      return acc;
    }, {})
  ).map(([uid, recs]) => ({
    uid,
    name: allUsers[uid] || uid,
    present: recs.filter(r => r.status === "present").length,
    absent:  recs.filter(r => r.status === "absent").length,
    late:    recs.filter(r => r.status === "late").length,
    total:   recs.length,
    rate:    recs.length ? Math.round((recs.filter(r => r.status === "present").length / recs.length) * 100) : 0,
    records: recs.sort((a, b) => b.date.localeCompare(a.date)),
  })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" }}>
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-slate-900">Admin Panel</h1>
          <p className="text-slate-400 text-sm">Class rep controls</p>
        </div>
      </div>

      {/* Class info banner */}
      {myClass && (
        <div className="rounded-xl px-5 py-4 mb-5 flex items-center justify-between flex-wrap gap-3"
          style={{ background: "linear-gradient(135deg, #f3e7d4, #b98a2e)" }}>
          <div className="flex items-center gap-3">
            <GraduationCap className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-white font-semibold text-sm">{myClass.name}</p>
              <p className="text-slate-400 text-xs mt-0.5">{myClass.major}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Join Code</p>
              <p className="text-white font-mono font-bold text-lg tracking-widest">{myClass.joinCode}</p>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(myClass.joinCode); toast.success("Copied!"); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <Copy size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Users,         label: "Students",     value: loading ? "—" : stats.students },
          { icon: BookOpen,      label: "Courses",       value: loading ? "—" : officialCourses.length },
          { icon: Bell,          label: "Announcements", value: loading ? "—" : announcements.length },
          { icon: TrendingUp,    label: "Events",        value: loading ? "—" : stats.events },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-[#e4e4dc] p-4">
            <Icon className="w-4 h-4 text-slate-400 mb-2" />
            <p className="text-[22px] font-bold text-slate-900 leading-none">{value}</p>
            <p className="text-[12px] text-slate-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        {(["announcements", "courses", "attendance", "students", "events"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Announcements Tab ─────────────────────────────── */}
      {tab === "announcements" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Post form */}
          <div className="bg-white rounded-xl border border-[#e4e4dc] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Megaphone className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-800 text-sm">Post Announcement</h2>
            </div>
            <form onSubmit={handlePostAnn} className="flex flex-col gap-3">
              <Input label="Title" placeholder="e.g. Assignment deadline extended"
                value={annForm.title} onChange={e => setAnnForm(p => ({ ...p, title: e.target.value }))} />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Body</label>
                <textarea placeholder="Write your announcement here..." value={annForm.body} rows={4}
                  onChange={e => setAnnForm(p => ({ ...p, body: e.target.value }))}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.12)] resize-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={annForm.pinned}
                  onChange={e => setAnnForm(p => ({ ...p, pinned: e.target.checked }))} className="rounded" />
                <span className="text-sm text-slate-600 flex items-center gap-1">
                  <Pin className="w-3.5 h-3.5" /> Pin this announcement
                </span>
              </label>
              <Button type="submit" loading={annSaving} fullWidth>Post Announcement</Button>
            </form>
          </div>

          {/* List */}
          <div className="bg-white rounded-xl border border-[#e4e4dc] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-800 text-sm">Posted Announcements</h2>
            </div>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
            ) : announcements.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No announcements yet.</p>
            ) : (
              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {announcements.map(a => (
                  <li key={a.id} className="flex items-start gap-3 px-3 py-3 rounded-lg border border-[#e4e4dc] group">
                    {a.pinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{a.title}</p>
                      <p className="text-[12px] text-slate-400 mt-0.5 line-clamp-2">{a.body}</p>
                      <p className="text-[11px] text-slate-300 mt-1">{new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => handleDeleteAnn(a.id)}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Courses Tab ───────────────────────────────────── */}
      {tab === "courses" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{officialCourses.length} official course{officialCourses.length !== 1 ? "s" : ""} — visible to all students</p>
            <Button onClick={() => setShowCourseForm(v => !v)}>
              {showCourseForm ? <X size={15} /> : <Plus size={15} />}
              {showCourseForm ? "Cancel" : "Add Official Course"}
            </Button>
          </div>

          {/* Add course form */}
          {showCourseForm && (
            <div className="bg-white rounded-xl border border-[#e4e4dc] p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-4">New Official Course</h2>
              <form onSubmit={handleAddCourse} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Course Name *" placeholder="e.g. Calculus I"
                    value={courseForm.name} onChange={e => setCourseForm(p => ({ ...p, name: e.target.value }))} />
                  <Input label="Code *" placeholder="e.g. MATH101"
                    value={courseForm.code} onChange={e => setCourseForm(p => ({ ...p, code: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Instructor" placeholder="e.g. Dr. Smith"
                    value={courseForm.instructor} onChange={e => setCourseForm(p => ({ ...p, instructor: e.target.value }))} />
                  <Input label="Room" placeholder="e.g. B-204"
                    value={courseForm.room} onChange={e => setCourseForm(p => ({ ...p, room: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Start Time" type="time" value={courseForm.startTime}
                    onChange={e => setCourseForm(p => ({ ...p, startTime: e.target.value }))} />
                  <Input label="End Time" type="time" value={courseForm.endTime}
                    onChange={e => setCourseForm(p => ({ ...p, endTime: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700">Days *</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map(d => (
                      <button key={d} type="button" onClick={() => toggleDay(d)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                        style={courseForm.days.includes(d)
                          ? { background: "linear-gradient(135deg, #b98a2e, #8b5e1b)", color: "#fff", borderColor: "transparent" }
                          : { borderColor: "#e8e4da", color: "#64748b" }}>{d}</button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700">Color</label>
                  <div className="flex gap-2">
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setCourseForm(p => ({ ...p, color: c }))}
                        className={`w-6 h-6 rounded-full border-2 transition-all bg-${c}-400 ${
                          courseForm.color === c ? "border-slate-700 scale-110" : "border-transparent"
                        }`} />
                    ))}
                  </div>
                </div>
                <Button type="submit" loading={courseSaving} fullWidth>Add Course</Button>
              </form>
            </div>
          )}

          {/* Course list */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : officialCourses.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No official courses yet. Add one above.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {officialCourses.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-[#e4e4dc] p-4 group">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{c.code}</span>
                    </div>
                    <button onClick={() => handleDeleteCourse(c.id)}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm mb-1">{c.name}</p>
                  {c.instructor && <p className="text-xs text-slate-400">{c.instructor}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">{c.days?.join(", ")} · {c.startTime}–{c.endTime}</p>
                  {c.room && <p className="text-xs text-slate-400">{c.room}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Attendance Tab ────────────────────────────────── */}
      {tab === "attendance" && (
        <div className="space-y-4">
          {/* Course + actions bar */}
          <div className="bg-white rounded-xl border border-[#e4e4dc] p-4 flex flex-wrap items-center gap-3">
            <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Official Course</label>
              <select value={selectedCourse} onChange={e => { setSelectedCourse(e.target.value); setMarkMode(false); }}
                className="block w-full mt-1 text-sm text-slate-800 bg-transparent outline-none">
                <option value="">— Choose a course —</option>
                {officialCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
            {selectedCourse && (
              <Button onClick={() => {
                setMarkMode(v => !v);
                if (!markMode) {
                  const defaults: Record<string, "present"|"absent"|"late"> = {};
                  allStudents.forEach(s => { defaults[s.uid] = "present"; });
                  setMarkStatuses(defaults);
                }
              }}>
                <ClipboardCheck size={15} />
                {markMode ? "Cancel" : "Mark Attendance"}
              </Button>
            )}
          </div>

          {/* Mark attendance form */}
          {markMode && selectedCourse && (
            <div className="bg-white rounded-xl border border-[#e4e4dc] p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-semibold text-slate-800 text-sm">Mark Attendance</h3>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Date</label>
                  <input type="date" value={markDate} onChange={e => setMarkDate(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#b98a2e]" />
                </div>
              </div>

              {allStudents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No students in your class yet.</p>
              ) : (
                <div className="space-y-2">
                  {/* Quick-set all buttons */}
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className="text-xs text-slate-400 mr-1">Set all:</span>
                    {(["present","absent","late"] as const).map(s => (
                      <button key={s} type="button"
                        onClick={() => setMarkStatuses(prev => Object.fromEntries(allStudents.map(u => [u.uid, s])))}
                        className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors ${
                          s === "present" ? "border-green-200 text-green-700 hover:bg-green-50" :
                          s === "absent"  ? "border-red-200 text-red-700 hover:bg-red-50" :
                                            "border-amber-200 text-amber-700 hover:bg-amber-50"
                        }`}>{s}</button>
                    ))}
                  </div>

                  {allStudents
                    .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""))
                    .map(s => (
                      <div key={s.uid} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {(s.displayName || s.email || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <p className="text-sm text-slate-700 flex-1 truncate">{s.displayName || s.email}</p>
                        <div className="flex gap-1.5">
                          {(["present","absent","late"] as const).map(status => (
                            <button key={status} type="button"
                              onClick={() => setMarkStatuses(prev => ({ ...prev, [s.uid]: status }))}
                              className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                                markStatuses[s.uid] === status
                                  ? status === "present" ? "bg-green-600 text-white border-green-600"
                                  : status === "absent"  ? "bg-red-500 text-white border-red-500"
                                  :                        "bg-amber-500 text-white border-amber-500"
                                  : "border-slate-200 text-slate-400 hover:border-slate-300"
                              }`}>{status[0].toUpperCase()}</button>
                          ))}
                        </div>
                      </div>
                    ))}

                  <Button fullWidth loading={markSaving} onClick={handleMarkAttendance} className="mt-2">
                    Save Attendance for {markDate}
                  </Button>
                </div>
              )}
            </div>
          )}

          {!selectedCourse ? (
            <div className="text-center py-16 text-slate-400 text-sm">Select a course above to see attendance.</div>
          ) : attLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : byStudent.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No attendance records for {selectedCourseName} yet.</div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">{byStudent.length} student{byStudent.length !== 1 ? "s" : ""} with records for {selectedCourseName}</p>
              {byStudent.map(s => (
                <StudentAttendanceRow key={s.uid} student={s} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Events Tab ───────────────────────────────────── */}
      {tab === "events" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{classEvents.length} class-wide event{classEvents.length !== 1 ? "s" : ""}</p>
            <Button onClick={() => setShowEventForm(v => !v)}>
              {showEventForm ? <X size={15} /> : <Plus size={15} />}
              {showEventForm ? "Cancel" : "Post Event"}
            </Button>
          </div>

          {showEventForm && (
            <div className="bg-white rounded-xl border border-[#e4e4dc] p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-4">New Class Event</h2>
              <form onSubmit={handlePostEvent} className="flex flex-col gap-3">
                <Input label="Title *" placeholder="e.g. Mid-term exam"
                  value={eventForm.title} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))} />
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700">Description</label>
                  <textarea placeholder="Optional details..." value={eventForm.description} rows={3}
                    onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))}
                    className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.12)] resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Date *" type="date" value={eventForm.eventDate}
                    onChange={e => setEventForm(p => ({ ...p, eventDate: e.target.value }))} />
                  <Input label="Time" type="time" value={eventForm.eventTime}
                    onChange={e => setEventForm(p => ({ ...p, eventTime: e.target.value }))} />
                </div>
                <Input label="Location" placeholder="e.g. Hall A"
                  value={eventForm.location} onChange={e => setEventForm(p => ({ ...p, location: e.target.value }))} />
                <Button type="submit" loading={eventSaving} fullWidth>Post to Class</Button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : classEvents.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No class events yet. Post one above.</div>
          ) : (
            <div className="space-y-2">
              {classEvents.map(ev => (
                <div key={ev.id} className="bg-white rounded-xl border border-[#e4e4dc] px-4 py-3 flex items-start gap-4 group">
                  <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-slate-100 shrink-0">
                    <Calendar className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{ev.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ev.eventDate}{ev.eventTime ? ` · ${(() => { const [h,m] = ev.eventTime.split(":").map(Number); return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; })()}` : ""}
                    </p>
                    {(ev as any).location && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={10} /> {(ev as any).location}
                      </p>
                    )}
                    {(ev as any).description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{(ev as any).description}</p>
                    )}
                  </div>
                  <button onClick={() => handleDeleteEvent(ev.id)}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Students Tab ──────────────────────────────────── */}
      {tab === "students" && (
        <div className="space-y-4">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by name or email..."
            value={studentSearch}
            onChange={e => setStudentSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-[#e4e4dc] bg-white text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />

          {loading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <>
              <p className="text-xs text-slate-400">{allStudents.length} registered user{allStudents.length !== 1 ? "s" : ""}</p>
              <div className="bg-white rounded-xl border border-[#e4e4dc] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#e4e4dc]">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Student ID</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Joined</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {allStudents
                      .filter(u => {
                        const q = studentSearch.toLowerCase();
                        return !q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
                      })
                      .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""))
                      .map(u => (
                        <tr key={u.uid} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                                {(u.displayName || u.email || "?").slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate">{u.displayName || "—"}</p>
                                <p className="text-xs text-slate-400 truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">{u.studentId || "—"}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                              style={u.role === "admin"
                                ? { background: "linear-gradient(135deg, #b98a2e, #8b5e1b)", color: "#fff" }
                                : { background: "#f1f5f9", color: "#64748b" }}>
                              {u.role === "admin" ? "Admin" : "Student"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleRole(u.uid, u.role)}
                                disabled={!!roleUpdating}
                                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                                  u.role === "admin"
                                    ? "border-red-200 text-red-600 hover:bg-red-50"
                                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}>
                                {roleUpdating === u.uid ? "Saving…" : u.role === "admin" ? "Demote" : "Make Admin"}
                              </button>
                              <button
                                onClick={() => handleRemoveFromClass(u.uid, u.displayName || u.email)}
                                disabled={!!roleUpdating}
                                title="Remove from class"
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50">
                                <UserMinus size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

// ─── Student Attendance Row ───────────────────────────────────
function StudentAttendanceRow({ student }: {
  student: {
    uid: string; name: string;
    present: number; absent: number; late: number; total: number; rate: number;
    records: AttendanceRecord[];
  };
}) {
  const [open, setOpen] = useState(false);
  const rateColor = student.rate >= 80 ? "text-green-600" : student.rate >= 60 ? "text-amber-600" : "text-red-600";

  return (
    <div className="bg-white rounded-xl border border-[#e4e4dc] overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
          {student.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{student.name}</p>
          <p className="text-xs text-slate-400">{student.total} record{student.total !== 1 ? "s" : ""} · {student.present}P · {student.absent}A · {student.late}L</p>
        </div>
        <span className={`text-sm font-bold ${rateColor} shrink-0`}>{student.rate}%</span>
        {open ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-[#e4e4dc] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {student.records.map(r => (
                <tr key={r.id} className="border-t border-slate-50">
                  <td className="px-4 py-2 text-slate-700">{r.date}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[r.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
