"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AdminRequest } from "@/types";
import {
  Crown, Users, GraduationCap, ShieldCheck, Building2,
  UserCheck, UserX, Clock, AlertCircle, Check, X,
  ChevronDown, Search, LogOut, Trash2, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";

async function apiFetch(path: string, options?: RequestInit) {
  const { getAuth } = await import("firebase/auth");
  const token = await getAuth().currentUser?.getIdToken();
  return fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  });
}

type Tab        = "overview" | "requests" | "users" | "classes";
type ReqFilter  = "pending" | "approved" | "rejected";
type RoleFilter = "all" | "student" | "admin" | "superadmin";

const INPUT_CLS = "w-full px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm text-slate-800 outline-none transition-all focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white";

const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  student:    { bg: "rgba(201,168,76,0.12)",  color: "#b98a2e"  },
  admin:      { bg: "#fffbeb",              color: "#b45309"  },
  superadmin: { bg: "#f5f3ff",              color: "#6d28d9"  },
};

const STATUS_CFG: Record<string, { bg: string; color: string; icon: React.ElementType }> = {
  pending:  { bg: "#fffbeb", color: "#b45309", icon: Clock      },
  approved: { bg: "#f0fdf4", color: "#15803d", icon: UserCheck  },
  rejected: { bg: "#fef2f2", color: "#b91c1c", icon: UserX      },
};

// ─── Role-change modal ────────────────────────────────────────
function RoleChangeModal({ user: target, newRole, hasClass, onConfirm, onCancel }: {
  user: { uid: string; displayName: string; email: string; role: string };
  newRole: string; hasClass: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const isDemotion   = target.role === "admin" && newRole !== "admin";
  const isSuperadmin = newRole === "superadmin";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[#f5f2ec]">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-[15px]">Change Role</h2>
            <p className="text-[11px] text-slate-400">This takes effect immediately</p>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-3">
          <p className="text-[13px] text-slate-600">
            Change <span className="font-semibold text-slate-800">{target.displayName || target.email}</span>'s role
            from <span className="font-semibold capitalize">{target.role === "admin" ? "Class Rep" : target.role}</span> to{" "}
            <span className="font-semibold capitalize">{newRole === "admin" ? "Class Rep" : newRole}</span>?
          </p>

          {isDemotion && hasClass && (
            <div className="rounded-xl px-3 py-2.5 border border-red-100 bg-red-50">
              <p className="text-[12px] text-red-600">
                This user manages a class. Removing their Class Rep role will leave the class without an admin.
              </p>
            </div>
          )}
          {isSuperadmin && (
            <div className="rounded-xl px-3 py-2.5 border border-violet-100 bg-violet-50">
              <p className="text-[12px] text-violet-700">
                Super Admin has full system access including approving requests and deleting classes.
              </p>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
              Cancel
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: isSuperadmin ? "#6d28d9" : isDemotion ? "#dc2626" : "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const { profile, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [tab,        setTab]        = useState<Tab>("overview");
  const [reqFilter,  setReqFilter]  = useState<ReqFilter>("pending");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [stats,      setStats]      = useState<any>(null);
  const [requests,   setRequests]   = useState<AdminRequest[]>([]);
  const [users,      setUsers]      = useState<any[]>([]);
  const [classes,    setClasses]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [acting,     setActing]     = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<AdminRequest | null>(null);
  const [rejectNote,   setRejectNote]   = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  const [roleModal, setRoleModal] = useState<{ user: any; newRole: string; hasClass: boolean } | null>(null);

  useEffect(() => {
    if (!authLoading && profile && profile.role !== "superadmin") router.replace("/dashboard");
  }, [authLoading, profile, router]);

  useEffect(() => {
    if (profile?.role !== "superadmin") return;
    setLoading(true);
    const load = async () => {
      if (tab === "overview") {
        const res = await apiFetch("/api/superadmin/stats");
        if (res.ok) setStats(await res.json());
      } else if (tab === "requests") {
        const res = await apiFetch(`/api/admin-requests?status=${reqFilter}`);
        setRequests(res.ok ? await res.json() : []);
      } else if (tab === "users") {
        const res = await apiFetch("/api/superadmin/users");
        setUsers(res.ok ? await res.json() : []);
      } else if (tab === "classes") {
        const res = await apiFetch("/api/superadmin/classes");
        setClasses(res.ok ? await res.json() : []);
      }
    };
    load().finally(() => setLoading(false));
  }, [tab, reqFilter, profile]);

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      const res = await apiFetch(`/api/admin-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) });
      if (!res.ok) throw new Error();
      toast.success("Approved — user is now a class rep");
      const [r2, s] = await Promise.all([
        apiFetch(`/api/admin-requests?status=${reqFilter}`),
        apiFetch("/api/superadmin/stats"),
      ]);
      setRequests(r2.ok ? await r2.json() : []);
      if (s.ok) setStats(await s.json());
    } catch { toast.error("Failed"); }
    finally { setActing(null); }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setRejectSaving(true);
    try {
      const res = await apiFetch(`/api/admin-requests/${rejectTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "reject", rejectionNote: rejectNote.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success("Request rejected");
      setRejectTarget(null); setRejectNote("");
      const [r2, s] = await Promise.all([
        apiFetch(`/api/admin-requests?status=${reqFilter}`),
        apiFetch("/api/superadmin/stats"),
      ]);
      setRequests(r2.ok ? await r2.json() : []);
      if (s.ok) setStats(await s.json());
    } catch { toast.error("Failed"); }
    finally { setRejectSaving(false); }
  };

  const handleDeleteClass = async (id: string, name: string) => {
    if (!confirm(`Delete class "${name}"? All students will be removed.`)) return;
    setActing(id);
    try {
      const res = await apiFetch(`/api/superadmin/classes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Class deleted");
      setClasses(prev => prev.filter((c: any) => c.id !== id));
      const s = await apiFetch("/api/superadmin/stats");
      if (s.ok) setStats(await s.json());
    } catch { toast.error("Failed to delete class"); }
    finally { setActing(null); }
  };

  const confirmRoleChange = async () => {
    if (!roleModal) return;
    const { user: target, newRole } = roleModal;
    setRoleModal(null); setActing(target.uid);
    try {
      const res = await apiFetch("/api/superadmin/users", {
        method: "PATCH", body: JSON.stringify({ targetUid: target.uid, role: newRole }),
      });
      if (!res.ok) throw new Error();
      toast.success("Role updated");
      setUsers(prev => prev.map(u => u.uid === target.uid ? { ...u, role: newRole } : u));
    } catch { toast.error("Failed to update role"); }
    finally { setActing(null); }
  };

  const requestRoleChange = (u: any, newRole: string) => {
    if (newRole === u.role) return;
    setRoleModal({ user: u, newRole, hasClass: !!u.classId });
  };

  if (authLoading || !profile) return null;
  if (profile.role !== "superadmin") return null;

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview",  icon: Crown       },
    { key: "requests", label: "Requests",  icon: UserCheck   },
    { key: "users",    label: "Users",     icon: Users       },
    { key: "classes",  label: "Classes",   icon: Building2   },
  ];

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return (!q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      && (roleFilter === "all" || u.role === roleFilter);
  });

  const initials = (str: string) => (str || "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen" style={{ background: "#f5f2ec" }}>

      {/* ── Modals ─────────────────────────────────────────── */}
      {roleModal && (
        <RoleChangeModal
          user={roleModal.user} newRole={roleModal.newRole} hasClass={roleModal.hasClass}
          onConfirm={confirmRoleChange} onCancel={() => setRoleModal(null)} />
      )}

      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f5f2ec]">
              <div>
                <h2 className="font-bold text-slate-900 text-[15px]">Reject Application</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">The applicant will see your reason</p>
              </div>
              <button onClick={() => { setRejectTarget(null); setRejectNote(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <X size={15} className="text-slate-400" />
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <p className="text-[13px] text-slate-600">
                Rejecting <span className="font-semibold text-slate-800">{rejectTarget.displayName}</span>'s
                application for <span className="font-semibold">{rejectTarget.className}</span>.
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Reason (optional)
                </label>
                <textarea rows={3} value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  placeholder="e.g. A class rep for this cohort already exists."
                  className={`${INPUT_CLS} resize-none`} />
              </div>
              <div className="flex gap-2.5">
                <button onClick={() => { setRejectTarget(null); setRejectNote(""); }} disabled={rejectSaving}
                  className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleRejectConfirm} disabled={rejectSaving}
                  className="flex-1 flex items-center justify-center py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50">
                  {rejectSaving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : "Reject"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-[#d7b46b] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.62),_transparent_34%),linear-gradient(135deg,#f8eed8_0%,#f1d28d_24%,#d9ab50_100%)] shadow-[0_12px_30px_rgba(120,90,32,0.12)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center border border-[#b98a2e]/30 bg-[#fffaf0]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <Crown size={18} className="text-[#8a5d12]" />
            </div>
            <div>
              <p className="font-bold text-[15px] leading-none text-[#3e2c16]">UniLife</p>
              <p className="text-[10px] mt-1 font-semibold uppercase tracking-[0.24em] text-[#7a4f12]">Super Admin</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#9c6b18]/20 bg-[#fffaf0]/55 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
              <span className="text-[11px] font-medium text-[#4f3415]">{profile.displayName || profile.email}</span>
            </div>
            <button onClick={() => { logout(); router.push("/auth/login"); }}
              className="flex items-center gap-1.5 rounded-full border border-[#8e6518]/20 bg-[#fffaf0]/55 px-3 py-1.5 text-[12px] font-medium text-[#4f3415] transition-all hover:bg-[#fffaf0]/70 active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:py-8">
        <section className="mb-6 rounded-[30px] border border-[#e9dec7] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(249,243,234,0.92))] p-4 sm:p-5 shadow-[0_16px_40px_rgba(67,51,21,0.07)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#b98a2e]">Operations dashboard</p>
              <h1 className="mt-1 text-3xl sm:text-4xl text-[#30343b] leading-none">Super Admin</h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-[#e8d7a1] bg-[#fff8e7] px-3 py-1.5 text-[11px] font-semibold text-[#9a6a18]">
                {stats?.pendingReqs ?? 0} pending requests
              </div>
              <div className="rounded-full border border-[#d7dfd0] bg-[#f2f9f2] px-3 py-1.5 text-[11px] font-semibold text-[#37704a]">
                {stats?.totalClasses ?? 0} active classes
              </div>
            </div>
          </div>
        </section>

        <div className="mb-6 flex w-full flex-wrap gap-2 rounded-[28px] border border-[#ebdcc2] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(249,243,234,0.95))] p-2 shadow-[0_18px_40px_rgba(94,79,44,0.08)] sm:w-fit">
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = tab === key;
            const isRequestTab = key === "requests";

            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="group relative flex items-center gap-2 rounded-[18px] border px-3.5 py-2.5 text-[12px] font-semibold transition-all duration-200 sm:px-4"
                style={
                  isActive
                    ? {
                        background: "linear-gradient(135deg, #d9a94b 0%, #b98a2e 38%, #9d731a 100%)",
                        color: "#fffaf3",
                        borderColor: "rgba(155, 117, 35, 0.38)",
                        boxShadow: "0 12px 26px rgba(185,138,46,0.22)",
                      }
                    : {
                        background: "rgba(255,255,255,0.52)",
                        color: "#5d5e58",
                        borderColor: "rgba(255,255,255,0.5)",
                      }
                }
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-[10px] border"
                  style={
                    isActive
                      ? { background: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.3)" }
                      : { background: "rgba(201,168,76,0.10)", borderColor: "rgba(201,168,76,0.22)" }
                  }
                >
                  <Icon size={12} />
                </span>
                <span>{label}</span>
                {isRequestTab && stats?.pendingReqs > 0 && (
                  <span
                    className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
                    style={{ background: isActive ? "#f87171" : "#ef4444" }}
                  >
                    {stats.pendingReqs}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── OVERVIEW ───────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-[#e8e4da]" />)}
              </div>
            ) : stats && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: Users,        label: "Total Users",  value: stats.totalUsers,    color: "#b98a2e", bg: "rgba(201,168,76,0.12)" },
                    { icon: GraduationCap, label: "Students",    value: stats.totalStudents, color: "#16a34a", bg: "#f0fdf4" },
                    { icon: ShieldCheck,  label: "Class Reps", value: stats.totalAdmins,   color: "#b45309", bg: "#fffbeb" },
                    { icon: Building2,    label: "Classes",    value: stats.totalClasses,  color: "#6d28d9", bg: "#f5f3ff" },
                  ].map(({ icon: Icon, label, value, color, bg }) => (
                    <div key={label} className="bg-white rounded-[26px] border border-[#e8e4da] p-4 shadow-[0_12px_26px_rgba(36,28,14,0.04)] transition-transform hover:-translate-y-0.5">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: bg }}>
                        <Icon size={16} style={{ color }} />
                      </div>
                      <p className="text-[26px] font-bold leading-none mb-1 text-[#30343b]">{value}</p>
                      <p className="text-[12px] font-semibold text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-[28px] border border-[#e8e4da] p-5 shadow-[0_14px_32px_rgba(36,28,14,0.04)]">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[13px] font-semibold text-slate-800">Class Rep Applications</p>
                    <span className="text-[11px] font-medium text-slate-400">Live overview</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: "Pending",  value: stats.pendingReqs,  key: "pending" },
                      { label: "Approved", value: stats.approvedReqs, key: "approved" },
                      { label: "Rejected", value: stats.rejectedReqs, key: "rejected" },
                    ].map(({ label, value, key }) => {
                      const cfg = STATUS_CFG[key];
                      const Icon = cfg.icon;
                      return (
                        <div key={label} className="rounded-[22px] px-4 py-3 border"
                          style={{ background: cfg.bg, borderColor: `${cfg.color}22` }}>
                          <Icon size={14} style={{ color: cfg.color }} />
                          <p className="text-[26px] font-bold leading-none mt-2" style={{ color: cfg.color }}>{value}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
                        </div>
                      );
                    })}
                  </div>

                  {stats.pendingReqs > 0 && (
                    <button onClick={() => setTab("requests")}
                      className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold py-2.75 rounded-[16px] border transition-all hover:brightness-95 active:scale-[0.98]"
                      style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }}>
                      <AlertCircle size={14} />
                      {stats.pendingReqs} pending request{stats.pendingReqs !== 1 ? "s" : ""} — review now
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── REQUESTS ───────────────────────────────────────── */}
        {tab === "requests" && (
          <div className="space-y-3">
            {/* Filter pills */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {(["pending","approved","rejected"] as ReqFilter[]).map(f => {
                const cfg = STATUS_CFG[f];
                return (
                  <button key={f} onClick={() => setReqFilter(f)}
                    className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold capitalize transition-all active:scale-[0.97]"
                    style={reqFilter === f
                      ? { background: "linear-gradient(135deg, #b98a2e, #a6731d)", color: "#fff" }
                      : { background: "#fff", color: "#64748b", border: "1px solid #e8e4da" }}>
                    {f}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-[#e8e4da]" />)}
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#f5f2ec] flex items-center justify-center mb-3">
                  <UserCheck size={20} className="text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium text-sm">No {reqFilter} requests</p>
              </div>
            ) : requests.map(r => {
              const cfg = STATUS_CFG[r.status];
              const StatusIcon = cfg.icon;
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-[#e8e4da] overflow-hidden">
                  <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#faf8f4] transition-colors text-left"
                    onClick={() => setExpanded(isOpen ? null : r.id)}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                      style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                      {initials(r.displayName || r.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{r.displayName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{r.email} · {r.className}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full capitalize"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        <StatusIcon size={9} /> {r.status}
                      </span>
                      <span className="text-[11px] text-slate-300 hidden sm:block">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                      <ChevronDown size={13} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-[#f5f2ec] px-5 py-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {[["Class", r.className], ["Major", r.major]].map(([lbl, val]) => (
                          <div key={lbl} className="rounded-xl px-3 py-2.5" style={{ background: "#faf8f4" }}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{lbl}</p>
                            <p className="text-[13px] font-medium text-slate-700">{val}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl px-3 py-2.5" style={{ background: "#faf8f4" }}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Reason</p>
                        <p className="text-[13px] text-slate-600">{r.reason}</p>
                      </div>
                      {r.rejectionNote && (
                        <div className="rounded-xl px-3 py-2.5 border border-red-100 bg-red-50">
                          <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-0.5">Rejection Note</p>
                          <p className="text-[13px] text-red-700">{r.rejectionNote}</p>
                        </div>
                      )}
                      {r.status === "pending" && (
                        <div className="flex gap-2.5 pt-1">
                          <button onClick={() => { setRejectTarget(r); setRejectNote(""); }} disabled={acting === r.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50 active:scale-[0.97] transition-all disabled:opacity-50">
                            <X size={13} /> Reject
                          </button>
                          <button onClick={() => handleApprove(r.id)} disabled={acting === r.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-[12px] font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                            style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                            {acting === r.id
                              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <><Check size={13} /> Approve</>}
                          </button>
                        </div>
                      )}
                      {r.reviewedAt && (
                        <p className="text-[11px] text-slate-400">
                          {r.status === "approved" ? "Approved" : "Rejected"} on {new Date(r.reviewedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── USERS ──────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" placeholder="Search by name or email…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-[#e8e4da] bg-white text-[13px] outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)]" />
              </div>
              <div className="flex gap-1 bg-white border border-[#e8e4da] rounded-2xl p-1 shrink-0">
                {(["all","student","admin","superadmin"] as RoleFilter[]).map(f => {
                  const labels: Record<RoleFilter, string> = { all: "All", student: "Students", admin: "Class Reps", superadmin: "Super Admin" };
                  return (
                    <button key={f} onClick={() => setRoleFilter(f)}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap"
                      style={roleFilter === f
                        ? { background: "linear-gradient(135deg, #b98a2e, #a6731d)", color: "#fff" }
                        : { color: "#94a3b8" }}>
                      {labels[f]}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1,2,3,4].map(i => <div key={i} className="h-14 bg-white rounded-2xl animate-pulse border border-[#e8e4da]" />)}
              </div>
            ) : (
              <>
                <p className="text-[12px] text-slate-400">{filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}</p>
                <div className="bg-white rounded-2xl border border-[#e8e4da] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "#faf8f4" }}>
                        {["User", "Class", "Joined", "Role", ""].map(h => (
                          <th key={h} className={`text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest ${
                            h === "Class" ? "hidden lg:table-cell" : h === "Joined" ? "hidden md:table-cell" : ""
                          }`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => {
                        const rs = ROLE_STYLES[u.role] ?? { bg: "#f5f2ec", color: "#64748b" };
                        return (
                          <tr key={u.uid} className="border-t border-[#f8f5f0] hover:bg-[#faf8f4] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                                  {initials(u.displayName || u.email)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[13px] font-semibold text-slate-800 truncate">{u.displayName || "—"}</p>
                                  <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-slate-500 hidden lg:table-cell">
                              {u.className || <span className="text-slate-300">No class</span>}
                            </td>
                            <td className="px-4 py-3 text-[12px] text-slate-400 hidden md:table-cell">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize"
                                style={{ background: rs.bg, color: rs.color }}>
                                {u.role === "admin" ? "Class Rep" : u.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <select value={u.role} disabled={acting === u.uid}
                                onChange={e => requestRoleChange(u, e.target.value)}
                                className="text-[12px] border border-[#e8e4da] rounded-xl px-2.5 py-1.5 bg-white text-slate-600 outline-none cursor-pointer hover:border-[#b98a2e] transition-colors disabled:opacity-50">
                                <option value="student">Student</option>
                                <option value="admin">Class Rep</option>
                                <option value="superadmin">Super Admin</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── CLASSES ────────────────────────────────────────── */}
        {tab === "classes" && (
          <div className="space-y-3">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1,2,3].map(i => <div key={i} className="h-40 bg-white rounded-2xl animate-pulse border border-[#e8e4da]" />)}
              </div>
            ) : classes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#f5f2ec] flex items-center justify-center mb-3">
                  <Building2 size={20} className="text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium text-sm">No classes yet</p>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-slate-400">{classes.length} class{classes.length !== 1 ? "es" : ""}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {classes.map((cls: any) => (
                    <div key={cls.id} className="bg-white rounded-2xl border border-[#e8e4da] p-5 card-lift">
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-slate-800 leading-tight">{cls.name}</p>
                          <p className="text-[12px] text-slate-400 mt-0.5">{cls.major}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-[13px] px-2.5 py-1 rounded-xl tracking-widest"
                            style={{ background: "rgba(201,168,76,0.12)", color: "#b98a2e" }}>
                            {cls.joinCode}
                          </span>
                          <button onClick={() => handleDeleteClass(cls.id, cls.name)} disabled={acting === cls.id}
                            className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#e8e4da] text-slate-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl px-3 py-2.5" style={{ background: "#faf8f4" }}>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Students</p>
                          <p className="text-[22px] font-bold text-slate-800 mt-0.5 leading-none">{cls.studentCount}</p>
                        </div>
                        <div className="rounded-xl px-3 py-2.5" style={{ background: "#faf8f4" }}>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Class Rep</p>
                          <p className="text-[13px] font-semibold text-slate-700 mt-0.5 truncate">{cls.adminName || "—"}</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 mt-3">
                        Created {new Date(cls.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
