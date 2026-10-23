"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  updateUserProfile, getUserStudyLogs, getUserTasks, getFocusNotes,
} from "@/lib/firestore";
import { getStorage } from "@/lib/firebase";
import {
  User, Mail, Phone, IdCard, Save, Shield, Pencil, X, Wallet,
  GraduationCap, Users, Clock, CheckCircle, XCircle, Camera,
  Target, Sparkles, BookOpen, Flame, FileText,
} from "lucide-react";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import toast from "react-hot-toast";
import Image from "next/image";

// ─── Geometric SVG bg ────────────────────────────────────────
function GeoBg() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="geo-profile" x="0" y="0" width="64" height="64" patternUnits="userSpaceOnUse">
          <rect x="4" y="4" width="56" height="56" fill="none" stroke="rgba(201,168,76,0.13)" strokeWidth="0.7" />
          <rect x="4" y="4" width="56" height="56" fill="none" stroke="rgba(201,168,76,0.08)" strokeWidth="0.5"
            transform="rotate(45 32 32)" />
          <rect x="16" y="16" width="32" height="32" fill="none" stroke="rgba(201,168,76,0.07)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#geo-profile)" />
    </svg>
  );
}

// ─── Stat card ───────────────────────────────────────────────
function StatCard({ value, label, icon: Icon, color }: {
  value: number | string; label: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-4 px-3 flex-1">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-0.5"
        style={{ background: "rgba(255,255,255,0.08)" }}>
        <Icon size={15} style={{ color }} />
      </div>
      <span className="text-[22px] font-bold leading-none text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
    </div>
  );
}

// ─── Section card ────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#edeae4] shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────
function SectionHeader({ icon: Icon, title, action }: {
  icon: React.ElementType; title: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f5f2ec]">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(201,168,76,0.18)" }}>
          <Icon size={13} style={{ color: "#b98a2e" }} />
        </div>
        <h3 className="font-semibold text-slate-800 text-[13px]">{title}</h3>
      </div>
      {action}
    </div>
  );
}

// ─── Field row (view mode) ────────────────────────────────────
function FieldRow({ icon, label, value, note, mono = false }: {
  icon: React.ReactNode; label: string; value: string; note?: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-[#f8f5f0] last:border-0 group">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "#f8f5f0" }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
        <p className={`text-sm font-medium text-slate-800 truncate ${mono ? "font-mono" : ""}`}>
          {value || <span className="text-slate-300 font-normal italic">Not set</span>}
        </p>
        {note && <p className="text-[11px] text-slate-400 mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

// ─── Input field ─────────────────────────────────────────────
function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const INPUT_CLS = "w-full px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white";

export default function ProfilePage() {
  const { user, profile, refetchProfile } = useAuth();

  const [stats, setStats] = useState({ sessions: 0, focusMins: 0, notes: 0, tasks: 0 });

  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({
    displayName: "", phone: "", studentId: "", monthlyBudgetUSD: 0,
  });

  const [avatarUrl,       setAvatarUrl]       = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [classInfo, setClassInfo] = useState<{ name: string; major: string; joinCode?: string } | null>(null);
  const [joinCode,  setJoinCode]  = useState("");
  const [joining,   setJoining]   = useState(false);

  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showApply,  setShowApply]  = useState(false);
  const [applyForm,  setApplyForm]  = useState({ className: "", major: "", reason: "" });
  const [applying,   setApplying]   = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      displayName:      profile.displayName      || "",
      phone:            profile.phone            || "",
      studentId:        profile.studentId        || "",
      monthlyBudgetUSD: profile.monthlyBudgetUSD || 0,
    });
    setAvatarUrl((profile as any).photoURL || user?.photoURL || null);
  }, [profile, user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getUserStudyLogs(user.uid), getUserTasks(user.uid), getFocusNotes(user.uid)])
      .then(([logs, tasks, notes]) => {
        setStats({
          sessions:  logs.length,
          focusMins: logs.reduce((s, l) => s + Math.round(l.hours * 60), 0),
          notes:     notes.length,
          tasks:     tasks.filter(t => t.status === "completed").length,
        });
      }).catch(() => {});
  }, [user]);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    try {
      const tok = await (user as any).getIdToken();
      const res = await fetch("/api/admin-requests/my", { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) setMyRequests(await res.json());
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!profile || !user) return;
    if (profile.classId) {
      (async () => {
        try {
          const tok = await (user as any).getIdToken();
          const res = await fetch("/api/classes", { headers: { Authorization: `Bearer ${tok}` } });
          if (res.ok) { const d = await res.json(); if (d?.name || d?.id) setClassInfo(d); }
        } catch {}
      })();
    }
    fetchRequests();
    const poll = setInterval(() => refetchProfile(), 30_000);
    return () => clearInterval(poll);
  }, [profile, user, fetchRequests, refetchProfile]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 3 * 1024 * 1024) return toast.error("Image must be under 3 MB");
    setUploadingAvatar(true);
    try {
      const storage = await getStorage();
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(auth.currentUser!, { photoURL: url });
      await updateUserProfile(user.uid, { photoURL: url } as any);
      setAvatarUrl(url);
      toast.success("Avatar updated!");
    } catch { toast.error("Upload failed"); }
    finally { setUploadingAvatar(false); }
  };

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!form.displayName.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      await updateUserProfile(user!.uid, {
        displayName:      form.displayName.trim(),
        phone:            form.phone,
        studentId:        form.studentId,
        monthlyBudgetUSD: form.monthlyBudgetUSD,
      });
      await updateProfile(auth.currentUser!, { displayName: form.displayName.trim() });
      await refetchProfile();
      toast.success("Profile updated!");
      setEditing(false);
    } catch { toast.error("Failed to update"); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    setEditing(false);
    setForm({
      displayName:      profile?.displayName      || "",
      phone:            profile?.phone            || "",
      studentId:        profile?.studentId        || "",
      monthlyBudgetUSD: profile?.monthlyBudgetUSD || 0,
    });
  };

  const handlePasswordReset = async () => {
    if (!profile?.email) return;
    try {
      await sendPasswordResetEmail(auth, profile.email);
      toast.success("Password reset email sent!");
    } catch { toast.error("Failed to send reset email"); }
  };

  const handleJoinClass = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return toast.error("Enter a join code");
    setJoining(true);
    try {
      const tok = await (user as any).getIdToken();
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ joinCode: joinCode.trim().toUpperCase() }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || "Invalid join code"); return; }
      toast.success("Joined class!");
      window.location.reload();
    } catch { toast.error("Failed to join class"); }
    finally { setJoining(false); }
  };

  const handleCancelRequest = async (id: string) => {
    if (!confirm("Cancel your application?")) return;
    setCancelling(id);
    try {
      const tok = await (user as any).getIdToken();
      const res = await fetch(`/api/admin-requests/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) { toast.error("Failed to cancel"); return; }
      toast.success("Application cancelled");
      await fetchRequests();
    } catch { toast.error("Failed to cancel"); }
    finally { setCancelling(null); }
  };

  const handleApply = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!applyForm.className.trim() || !applyForm.major.trim() || !applyForm.reason.trim())
      return toast.error("Please fill in all fields");
    setApplying(true);
    try {
      const tok = await (user as any).getIdToken();
      const res = await fetch("/api/admin-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(applyForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || "Failed to submit"); return; }
      toast.success("Application submitted!");
      setShowApply(false);
      setApplyForm({ className: "", major: "", reason: "" });
      await fetchRequests();
    } catch { toast.error("Failed to submit"); }
    finally { setApplying(false); }
  };

  const initials    = profile?.displayName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U";
  const isAdmin     = profile?.role === "admin";
  const isSuperAdmin = profile?.role === "superadmin";

  const roleLabel = isSuperAdmin ? "Super Admin" : isAdmin ? "Class Representative" : "Student";
  const roleBadgeStyle = isSuperAdmin
    ? { background: "rgba(201,168,76,0.15)", color: "#b8872a", border: "1px solid rgba(201,168,76,0.25)" }
    : isAdmin
    ? { background: "rgba(201,168,76,0.12)", color: "#b98a2e", border: "1px solid rgba(201,168,76,0.2)" }
    : { background: "#f5f2ec", color: "#64748b", border: "1px solid #edeae4" };

  return (
    <DashboardLayout>
      <div className="max-w-xl mx-auto pb-12">

        {/* ── Hero card ──────────────────────────────────────── */}
        <Card className="mb-4 overflow-hidden">

          {/* Banner */}
          <div className="relative overflow-hidden"
            style={{ height: 120, background: "linear-gradient(140deg, #f3e7d4 0%, #b98a2e 55%, #a6731d 100%)" }}>
            <GeoBg />

            {/* Top-right glow */}
            <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
              style={{ background: "radial-gradient(circle at 80% 20%, rgba(201,168,76,0.12) 0%, transparent 65%)" }} />

            {/* Edit / Cancel button */}
            <div className="absolute top-3 right-3 z-10">
              {!editing ? (
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:brightness-110 active:scale-95"
                  style={{ background: "rgba(201,168,76,0.18)", color: "#d4a94e", border: "1px solid rgba(201,168,76,0.3)" }}>
                  <Pencil size={11} /> Edit Profile
                </button>
              ) : (
                <button onClick={handleCancel}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-95"
                  style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  <X size={11} /> Cancel
                </button>
              )}
            </div>
          </div>

          {/* Avatar + name */}
          <div className="px-6 pb-5">
            <div className="flex items-end gap-4 -mt-11 mb-4">

              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-[88px] h-[88px] rounded-2xl shadow-lg overflow-hidden ring-[3px] ring-white"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt="Avatar" width={88} height={88} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-white text-[26px] font-bold">{initials}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  {uploadingAvatar
                    ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Camera size={12} className="text-white" />}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>

              {/* Name block */}
              <div className="flex-1 min-w-0 mt-11 mb-0.5">
                <h2 className="text-[19px] font-bold text-slate-900 leading-tight truncate">
                  {profile?.displayName || "Student"}
                </h2>
                <p className="text-[13px] text-slate-400 truncate mt-0.5">{profile?.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold" style={roleBadgeStyle}>
                    {roleLabel}
                  </span>
                  {profile?.studentId && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#f5f2ec] text-slate-500 font-mono border border-[#edeae4]">
                      {profile.studentId}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats strip */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "linear-gradient(135deg, #f3e7d4, #b98a2e)" }}>
              <div className="grid grid-cols-4 divide-x" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <StatCard value={stats.sessions}  label="Sessions" icon={Flame}    color="#f97316" />
                <StatCard value={stats.focusMins} label="Minutes"  icon={Clock}    color="#a78bfa" />
                <StatCard value={stats.notes}     label="Notes"    icon={FileText} color="#34d399" />
                <StatCard value={stats.tasks}     label="Done"     icon={BookOpen} color="#60a5fa" />
              </div>
            </div>
          </div>
        </Card>

        {/* ── Personal Information ───────────────────────────── */}
        <Card className="mb-4">
          <SectionHeader
            icon={User}
            title="Personal Information"
            action={!editing ? (
              <button onClick={() => setEditing(true)}
                className="text-[12px] font-semibold transition-colors hover:opacity-70" style={{ color: "#b98a2e" }}>
                Edit
              </button>
            ) : undefined}
          />

          {editing ? (
            <form onSubmit={handleSave} className="px-6 pt-5 pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div className="sm:col-span-2">
                  <FormField label="Full Name *">
                    <input value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                      placeholder="Your full name" className={INPUT_CLS} />
                  </FormField>
                </div>

                <div className="sm:col-span-2">
                  <FormField label="Email" hint="Email cannot be changed">
                    <input value={profile?.email || ""} disabled
                      className={`${INPUT_CLS} bg-[#f9f7f4] text-slate-400 cursor-not-allowed`} />
                  </FormField>
                </div>

                <FormField label="Phone">
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="012 345 678" className={INPUT_CLS} />
                </FormField>

                <FormField label="Student ID">
                  <input value={form.studentId} onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))}
                    placeholder="STU-123456" className={`${INPUT_CLS} font-mono`} />
                </FormField>

                <div className="sm:col-span-2">
                  <FormField label="Monthly Budget (USD)" hint="Used as your spending limit in Finance tracker">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input type="number" min="0" step="1" placeholder="0"
                        value={form.monthlyBudgetUSD}
                        onChange={e => setForm(p => ({ ...p, monthlyBudgetUSD: Number(e.target.value) }))}
                        className={`${INPUT_CLS} pl-8`} />
                    </div>
                  </FormField>
                </div>
              </div>

              <div className="flex gap-2.5 mt-6 pt-5 border-t border-[#f5f2ec]">
                <button type="button" onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Save size={13} />}
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="px-6 pb-2">
              <FieldRow icon={<User size={13} className="text-slate-400" />}    label="Full Name"       value={profile?.displayName || ""} />
              <FieldRow icon={<Mail size={13} className="text-slate-400" />}    label="Email"           value={profile?.email || ""}       note="Cannot be changed" />
              <FieldRow icon={<Phone size={13} className="text-slate-400" />}   label="Phone"           value={profile?.phone || ""} />
              <FieldRow icon={<IdCard size={13} className="text-slate-400" />}  label="Student ID"      value={profile?.studentId || ""}   mono />
              <FieldRow icon={<Wallet size={13} className="text-slate-400" />}  label="Monthly Budget"
                value={profile?.monthlyBudgetUSD ? `$${profile.monthlyBudgetUSD} / month` : ""}
                note="Finance tracker spending limit" />
            </div>
          )}
        </Card>

        {/* ── Class ─────────────────────────────────────────── */}
        <Card className="mb-4">
          <SectionHeader icon={GraduationCap} title="Class" />
          <div className="px-6 py-5">
            {profile?.classId && classInfo ? (
              <div className="space-y-0 divide-y divide-[#f8f5f0]">
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-slate-500">Class Name</span>
                  <span className="text-sm font-semibold text-slate-800">{classInfo.name}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-slate-500">Major</span>
                  <span className="text-sm font-medium text-slate-700">{classInfo.major}</span>
                </div>
                {isAdmin && classInfo.joinCode && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm text-slate-500">Join Code</span>
                    <span className="text-sm font-mono font-bold px-3 py-1 rounded-lg tracking-widest"
                      style={{ color: "#b98a2e", background: "rgba(201,168,76,0.12)" }}>
                      {classInfo.joinCode}
                    </span>
                  </div>
                )}
              </div>
            ) : profile?.classId ? (
              <p className="text-sm text-slate-400">Loading class info…</p>
            ) : isAdmin ? (
              <p className="text-sm text-slate-500">
                Set up your class in the{" "}
                <a href="/admin" className="underline font-semibold" style={{ color: "#b98a2e" }}>Admin Panel</a>.
              </p>
            ) : (
              <div>
                <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                  You haven't joined a class yet. Enter the join code from your class representative.
                </p>
                <form onSubmit={handleJoinClass} className="flex gap-2">
                  <input type="text" placeholder="e.g. ABC123"
                    value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-mono uppercase tracking-widest outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white" />
                  <button type="submit" disabled={joining}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                    {joining
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Users size={14} />}
                    Join
                  </button>
                </form>
              </div>
            )}
          </div>
        </Card>

        {/* ── Class Rep Application ──────────────────────────── */}
        {!isAdmin && !isSuperAdmin && (
          <Card className="mb-4">
            <SectionHeader
              icon={Target}
              title="Class Rep Application"
              action={!myRequests.some(r => r.status === "pending" || r.status === "approved") && !showApply ? (
                <button onClick={() => setShowApply(true)}
                  className="text-[12px] font-semibold transition-colors hover:opacity-70" style={{ color: "#b98a2e" }}>
                  + Apply
                </button>
              ) : undefined}
            />

            <div className="px-6 py-5">
              {myRequests.length > 0 && (
                <div className="space-y-3 mb-4">
                  {myRequests.map((r: any) => (
                    <div key={r.id} className={`rounded-xl p-4 border ${
                      r.status === "pending"  ? "bg-amber-50  border-amber-100" :
                      r.status === "approved" ? "bg-green-50  border-green-100" :
                                                "bg-red-50    border-red-100"
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {r.status === "pending"  && <Clock       size={13} className="text-amber-500" />}
                        {r.status === "approved" && <CheckCircle size={13} className="text-green-600" />}
                        {r.status === "rejected" && <XCircle     size={13} className="text-red-500"   />}
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${
                          r.status === "pending"  ? "text-amber-700" :
                          r.status === "approved" ? "text-green-700" : "text-red-600"
                        }`}>{r.status}</span>
                        <span className="text-[11px] text-slate-400 ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{r.className}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.major}</p>

                      {r.status === "pending" && (
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-xs text-amber-600">Under review by super admin.</p>
                          <button onClick={() => handleCancelRequest(r.id)} disabled={cancelling === r.id}
                            className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors disabled:opacity-50">
                            {cancelling === r.id ? "Cancelling…" : "Cancel"}
                          </button>
                        </div>
                      )}
                      {r.status === "approved" && (
                        <p className="text-xs text-green-600 mt-2 font-medium">
                          Approved!{" "}
                          <a href="/admin" className="underline" style={{ color: "#b98a2e" }}>Set up your class →</a>
                        </p>
                      )}
                      {r.status === "rejected" && (
                        <div className="mt-2">
                          {r.rejectionNote && (
                            <div className="bg-red-100 rounded-lg px-3 py-2 mb-2">
                              <p className="text-[10px] text-red-400 uppercase font-semibold tracking-wider mb-0.5">Reason</p>
                              <p className="text-xs text-red-700">{r.rejectionNote}</p>
                            </div>
                          )}
                          <button onClick={() => { setShowApply(true); setApplyForm({ className: r.className, major: r.major, reason: "" }); }}
                            className="text-xs font-semibold hover:underline" style={{ color: "#b98a2e" }}>
                            Apply again →
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {myRequests.length === 0 && !showApply && (
                <p className="text-sm text-slate-400 leading-relaxed">
                  Want to manage a class? Apply to become a class representative — you'll be promoted once a super admin approves.
                </p>
              )}

              {showApply && (
                <form onSubmit={handleApply} className="space-y-3 pt-4 border-t border-[#f5f2ec]">
                  <p className="text-[13px] font-semibold text-slate-700 mb-3">New Application</p>
                  <input placeholder="Class name (e.g. Computer Science — Batch 2024)"
                    value={applyForm.className}
                    onChange={e => setApplyForm(p => ({ ...p, className: e.target.value }))}
                    className={INPUT_CLS} />
                  <input placeholder="Major / Faculty (e.g. Computer Science)"
                    value={applyForm.major}
                    onChange={e => setApplyForm(p => ({ ...p, major: e.target.value }))}
                    className={INPUT_CLS} />
                  <textarea rows={3} placeholder="Why do you want to be class representative?"
                    value={applyForm.reason}
                    onChange={e => setApplyForm(p => ({ ...p, reason: e.target.value }))}
                    className={`${INPUT_CLS} resize-none`} />
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setShowApply(false)}
                      className="px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
                      Cancel
                    </button>
                    <button type="submit" disabled={applying}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                      {applying && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      Submit Application
                    </button>
                  </div>
                </form>
              )}
            </div>
          </Card>
        )}

        {/* ── Account Details ────────────────────────────────── */}
        <Card className="mb-4">
          <SectionHeader icon={Sparkles} title="Account" />
          <div className="px-6 py-2 pb-3 divide-y divide-[#f8f5f0]">
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">Role</span>
              <span className="text-sm font-semibold" style={{ color: "#b98a2e" }}>{roleLabel}</span>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">Member since</span>
              <span className="text-sm font-medium text-slate-700">
                {profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">User ID</span>
              <span className="text-[11px] font-mono text-slate-400 bg-[#f5f2ec] px-2.5 py-1 rounded-lg truncate max-w-[180px]">
                {user?.uid}
              </span>
            </div>
          </div>
        </Card>

        {/* ── Security ───────────────────────────────────────── */}
        <Card>
          <SectionHeader icon={Shield} title="Security" />
          <div className="px-6 py-5">
            <div className="flex items-center justify-between p-4 rounded-2xl border border-[#edeae4] bg-[#faf8f4]">
              <div>
                <p className="text-sm font-semibold text-slate-700">Password</p>
                <p className="text-xs text-slate-400 mt-0.5">A reset link will be sent to your email</p>
              </div>
              <button onClick={handlePasswordReset}
                className="px-4 py-2 rounded-xl border border-[#e8e4da] bg-white text-sm font-semibold text-slate-700 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all shadow-sm">
                Reset Password
              </button>
            </div>
          </div>
        </Card>

      </div>
    </DashboardLayout>
  );
}
