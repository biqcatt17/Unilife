"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createUserProfile } from "@/lib/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  GraduationCap, User, Users, Shield,
  ArrowLeft, ArrowRight, CheckCircle,
  Eye, EyeOff,
} from "lucide-react";

type Mode = "solo" | "class" | "rep";

const STEPS = ["Your Info", "Password", "Choose Path"];

// ── Islamic geometric SVG tile ────────────────────────────────
function GeoBg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="geo-reg" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
          <rect x="4" y="4" width="64" height="64" fill="none"
            stroke="rgba(210,175,90,0.13)" strokeWidth="0.8" />
          <rect x="4" y="4" width="64" height="64" fill="none"
            stroke="rgba(210,175,90,0.10)" strokeWidth="0.6"
            transform="rotate(45 36 36)" />
          <rect x="18" y="18" width="36" height="36" fill="none"
            stroke="rgba(210,175,90,0.10)" strokeWidth="0.6" />
          <rect x="18" y="18" width="36" height="36" fill="none"
            stroke="rgba(210,175,90,0.08)" strokeWidth="0.5"
            transform="rotate(45 36 36)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#geo-reg)" />
    </svg>
  );
}

const GOOGLE_SVG = (
  <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

// ── Shared field component ────────────────────────────────────
function Field({
  label, type = "text", placeholder, value, onChange, suffix, autoFocus,
}: {
  label: string; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void;
  suffix?: React.ReactNode; autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type={type} placeholder={placeholder} value={value} autoFocus={autoFocus}
          onChange={e => onChange(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.12)]"
          style={{ paddingRight: suffix ? "2.75rem" : undefined }}
        />
        {suffix && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{suffix}</div>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  const [step,     setStep]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const [showCPw,  setShowCPw]  = useState(false);
  const [mode,     setMode]     = useState<Mode>("solo");
  const [joinCode, setJoinCode] = useState("");
  const [repForm,  setRepForm]  = useState({ className: "", major: "", reason: "" });
  const [form, setForm] = useState({
    displayName: "", email: "", password: "", confirm: "",
    studentId: `STU-${Math.floor(100000 + Math.random() * 900000)}`,
    phone: "",
  });

  const set = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const pwStrength = form.password.length === 0 ? 0
    : form.password.length < 6  ? 1
    : form.password.length < 10 ? 2
    : 3;
  const pwLabels = ["", "Too short", "Good", "Strong"];
  const pwColors = ["", "#ef4444", "#f59e0b", "#22c55e"];

  const validate = () => {
    if (step === 0) {
      if (!form.displayName.trim())         { toast.error("Full name is required"); return false; }
      if (!form.email.trim())               { toast.error("Email is required"); return false; }
      if (!/\S+@\S+\.\S+/.test(form.email)) { toast.error("Enter a valid email"); return false; }
    }
    if (step === 1) {
      if (!form.password)                   { toast.error("Password is required"); return false; }
      if (form.password.length < 6)         { toast.error("Password must be at least 6 characters"); return false; }
      if (form.password !== form.confirm)   { toast.error("Passwords do not match"); return false; }
    }
    if (step === 2) {
      if (mode === "class" && !joinCode.trim()) { toast.error("Enter a join code"); return false; }
      if (mode === "rep") {
        if (!repForm.className.trim()) { toast.error("Class name is required"); return false; }
        if (!repForm.major.trim())     { toast.error("Major is required"); return false; }
        if (!repForm.reason.trim())    { toast.error("Please tell us why you want to be class rep"); return false; }
      }
    }
    return true;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.displayName });
      await createUserProfile({
        uid: cred.user.uid, email: form.email, displayName: form.displayName,
        role: "student", studentId: form.studentId, phone: form.phone,
        createdAt: new Date().toISOString(), onboardingComplete: true,
      });

      const idToken = await cred.user.getIdToken();

      if (mode === "class" && joinCode.trim()) {
        const res = await fetch("/api/classes/join", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ joinCode: joinCode.trim().toUpperCase() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Invalid join code — you can join later from your profile");
        }
      }

      if (mode === "rep") {
        const res = await fetch("/api/admin-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify(repForm),
        });
        if (res.ok) toast.success("Application submitted! You'll be notified when approved.");
        else toast.error("Account created but application failed — try again from your profile.");
      }

      toast.success("Welcome to UniLife!");
      router.push("/dashboard");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") toast.error("Email already registered");
      else toast.error("Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGLoading(true);
    try {
      const { signInWithPopup } = await import("firebase/auth");
      const { googleProvider }  = await import("@/lib/firebase");
      const { getUserProfile }  = await import("@/lib/firestore");
      const result  = await signInWithPopup(auth, googleProvider);
      const profile = await getUserProfile(result.user.uid);
      if (profile) {
        // Existing user — go straight to dashboard
        router.push("/dashboard");
      } else {
        // Brand-new Google user — create profile and send to onboarding
        const { createUserProfile } = await import("@/lib/firestore");
        await createUserProfile({
          uid: result.user.uid, email: result.user.email!,
          displayName: result.user.displayName || "Student",
          role: "student", createdAt: new Date().toISOString(),
        });
        router.push("/auth/onboarding");
      }
    } catch {
      toast.error("Google sign-in failed. Try again.");
    } finally {
      setGLoading(false);
    }
  };

  // ── Step headings ─────────────────────────────────────────
  const headings = [
    { title: "Start your journey",      sub: "Create your free UniLife account" },
    { title: "Secure your account",     sub: "Choose a strong password"         },
    { title: "How will you use UniLife?", sub: "Pick the path that fits you best" },
  ];

  // ── Path options ──────────────────────────────────────────
  const PATHS = [
    {
      key:   "solo" as Mode,
      icon:  User,
      label: "Solo",
      desc:  "Just me — track my own studies",
      color: { border: "#1e293b", bg: "#1e293b" },
    },
    {
      key:   "class" as Mode,
      icon:  Users,
      label: "Join a Class",
      desc:  "I have a code from my class rep",
      color: { border: "#1d4ed8", bg: "#1d4ed8" },
    },
    {
      key:   "rep" as Mode,
      icon:  Shield,
      label: "Class Rep",
      desc:  "I want to manage a class",
      color: { border: "#6d28d9", bg: "#6d28d9" },
    },
  ] as const;

  return (
    <div className="min-h-screen flex font-sans">

      {/* ── Left panel ──────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[44%] flex-col justify-between p-14 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #f3e7d4 0%, #b98a2e 50%, #8b5e1b 100%)" }}
      >
        <GeoBg />

        <div className="absolute top-0 right-0 w-72 h-72 rounded-full -translate-y-1/2 translate-x-1/2"
          style={{ background: "radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full translate-y-1/2 -translate-x-1/2"
          style={{ background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-[rgba(156,131,91,0.25)]"
            style={{ background: "rgba(201,168,76,0.16)" }}>
            <GraduationCap className="w-5 h-5" style={{ color: "#8b5e1b" }} />
          </div>
          <div>
            <p className="text-[#30343b] font-bold text-[17px] leading-none tracking-tight">UniLife</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(48,52,59,0.68)" }}>Student Portal</p>
          </div>
        </div>

        {/* Quote & steps */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px w-8" style={{ background: "#b98a2e" }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#b98a2e" }} />
          </div>

          <blockquote className="text-[26px] font-bold leading-[1.3] mb-3 tracking-tight" style={{ color: "#f5f0e8" }}>
            "The best among you are those who learn and then teach others."
          </blockquote>
          <p className="text-[13px] mb-12" style={{ color: "rgba(48,52,59,0.64)" }}>
            Knowledge shared is knowledge multiplied.
          </p>

          {/* Step tracker */}
          <div className="flex flex-col gap-4">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300"
                  style={{
                    background: i < step ? "#b98a2e" : i === step ? "#fff" : "rgba(255,255,255,0.08)",
                    color:      i < step ? "#30343b" : i === step ? "#30343b" : "rgba(48,52,59,0.42)",
                  }}
                >
                  {i < step ? <CheckCircle size={14} /> : i + 1}
                </div>
                <span className="text-sm font-medium transition-all duration-300"
                  style={{ color: i === step ? "#fff" : "rgba(255,255,255,0.3)" }}>
                  {s}
                </span>
                {i === step && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#b98a2e" }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px]" style={{ color: "rgba(48,52,59,0.42)" }}>
          Built for students, by students.
        </p>
      </div>

      {/* ── Right panel ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 overflow-y-auto" style={{ background: "#faf8f3" }}>
        <div className="w-full max-w-[400px] py-6">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border"
              style={{ background: "linear-gradient(135deg, #d7b462, #c18d2a)", borderColor: "rgba(156,131,91,0.25)" }}>
              <GraduationCap className="w-5 h-5 text-[#fffaf0]" />
            </div>
            <span className="font-bold text-[#30343b] text-lg tracking-tight">UniLife</span>
          </div>

          {/* Mobile step dots */}
          <div className="flex items-center gap-2 mb-7 lg:hidden">
            {STEPS.map((_, i) => (
              <div key={i} className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width:      i === step ? 24 : 8,
                  background: i < step ? "#b98a2e" : i === step ? "#30343b" : "#e2e8f0",
                }} />
            ))}
          </div>

          {/* Desktop progress bar */}
          <div className="hidden lg:flex items-center gap-3 mb-8">
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-slate-200">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "#b98a2e" }} />
            </div>
            <span className="text-[11px] font-semibold text-[#5c6470] shrink-0 uppercase tracking-wider">
              {step + 1} / {STEPS.length}
            </span>
          </div>

          {/* Heading */}
          <h2 className="text-[26px] font-bold text-[#30343b] mb-1 tracking-tight">{headings[step].title}</h2>
          <p className="text-[#5c6470] text-sm mb-7">{headings[step].sub}</p>

          {/* Google — step 0 only */}
          {step === 0 && (
            <>
              <button onClick={handleGoogle} disabled={gLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-[#30343b] bg-white border border-[rgba(48,52,59,0.12)] hover:border-[rgba(48,52,59,0.18)] hover:shadow-md transition-all mb-5 disabled:opacity-50">
                {gLoading
                  ? <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  : GOOGLE_SVG}
                Continue with Google
              </button>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-[rgba(48,52,59,0.12)]" />
                <span className="text-[11px] text-[#5c6470] font-medium tracking-wide">OR</span>
                <div className="flex-1 h-px bg-[rgba(48,52,59,0.12)]" />
              </div>
            </>
          )}

          {/* ── Step content ─────────────────────────────── */}
          <div key={step} className="animate-in fade-in slide-in-from-right-3 duration-200">

            {/* STEP 0 — Info */}
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <Field label="Full Name *" placeholder="e.g. Sok Dara"
                  value={form.displayName} onChange={set("displayName")} autoFocus />
                <Field label="Email *" type="email" placeholder="you@example.com"
                  value={form.email} onChange={set("email")} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Student ID <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                    <input
                      type="text"
                      placeholder="Auto-generated"
                      value={form.studentId}
                      onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.12)]"
                    />
                    <p className="text-[11px] text-slate-400 -mt-0.5">Leave as-is or enter your real ID</p>
                  </div>
                  <Field label="Phone" placeholder="012 345 678"
                    value={form.phone} onChange={set("phone")} />
                </div>
              </div>
            )}

            {/* STEP 1 — Password */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <Field label="Password *" type={showPw ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={form.password} onChange={set("password")} autoFocus
                  suffix={
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="text-slate-300 hover:text-slate-500 transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                />
                {/* Strength bar */}
                {form.password && (
                  <div className="flex items-center gap-2 -mt-1">
                    <div className="flex gap-1 flex-1">
                      {[1,2,3].map(lvl => (
                        <div key={lvl} className="h-1 flex-1 rounded-full transition-all duration-300"
                          style={{ background: pwStrength >= lvl ? pwColors[pwStrength] : "#e2e8f0" }} />
                      ))}
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: pwColors[pwStrength] }}>
                      {pwLabels[pwStrength]}
                    </span>
                  </div>
                )}
                <Field label="Confirm Password *" type={showCPw ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={form.confirm} onChange={set("confirm")}
                  suffix={
                    <button type="button" onClick={() => setShowCPw(v => !v)}
                      className="text-slate-300 hover:text-slate-500 transition-colors">
                      {showCPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                />
                {/* Match indicator */}
                {form.confirm && (
                  <div className="flex items-center gap-1.5 -mt-1">
                    <CheckCircle size={13} className={form.password === form.confirm ? "text-green-500" : "text-red-400"} />
                    <span className={`text-[11px] font-medium ${form.password === form.confirm ? "text-green-600" : "text-red-400"}`}>
                      {form.password === form.confirm ? "Passwords match" : "Passwords do not match"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2 — Path */}
            {step === 2 && (
              <div className="flex flex-col gap-3">
                {PATHS.map(({ key, icon: Icon, label, desc, color }) => {
                  const active = mode === key;
                  return (
                    <button key={key} type="button" onClick={() => setMode(key)}
                      className="flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-all duration-200"
                      style={{
                        borderColor: active ? color.border : "#e2e8f0",
                        background:  active ? color.bg : "#ffffff",
                      }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
                        style={{ background: active ? "rgba(255,255,255,0.15)" : "#f8fafc" }}>
                        <Icon size={18} className={active ? "text-white" : "text-slate-400"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${active ? "text-white" : "text-slate-800"}`}>{label}</p>
                        <p className={`text-xs mt-0.5 ${active ? "text-white/65" : "text-slate-400"}`}>{desc}</p>
                      </div>
                      {active && <CheckCircle size={15} className="text-white/70 shrink-0" />}
                    </button>
                  );
                })}

                {/* Sub-forms */}
                {mode === "class" && (
                  <div className="p-4 rounded-2xl border border-blue-100 space-y-2 mt-1" style={{ background: "#eff6ff" }}>
                    <label className="text-xs font-semibold text-blue-700 uppercase tracking-wider block">Join Code *</label>
                    <input type="text" placeholder="e.g. CS2024" autoFocus
                      value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={8}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-200 bg-white text-sm font-mono uppercase tracking-widest text-blue-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    <p className="text-[11px] text-blue-400">Ask your class representative for this code.</p>
                  </div>
                )}

                {mode === "rep" && (
                  <div className="p-4 rounded-2xl border border-violet-100 space-y-3 mt-1" style={{ background: "#f5f3ff" }}>
                    <p className="text-[11px] text-violet-600 font-medium leading-relaxed">
                      You'll be registered as a student and promoted once a super admin approves your application.
                    </p>
                    <input autoFocus type="text" placeholder="Class name (e.g. Computer Science — Batch 2024)"
                      value={repForm.className}
                      onChange={e => setRepForm(p => ({ ...p, className: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    <input type="text" placeholder="Major / Faculty (e.g. Computer Science)"
                      value={repForm.major}
                      onChange={e => setRepForm(p => ({ ...p, major: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    <textarea rows={3} placeholder="Why do you want to be a class representative?"
                      value={repForm.reason}
                      onChange={e => setRepForm(p => ({ ...p, reason: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 resize-none" />
                  </div>
                )}

                {mode === "solo" && (
                  <p className="text-[12px] text-slate-400 text-center">
                    You can always join a class later from your profile.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Navigation ───────────────────────────────────── */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button onClick={back}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-[rgba(48,52,59,0.12)] bg-white text-sm font-medium text-[#49515d] hover:bg-[#f6f0e7] hover:border-[rgba(48,52,59,0.18)] transition-all">
                <ArrowLeft size={15} />
              </button>
            )}
            <div className="flex-1">
              {step < STEPS.length - 1 ? (
                <button onClick={next}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-[#fffaf0] transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #d7b462, #b08431)" }}>
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <button onClick={handleRegister} disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-[#fffaf0] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #d7b462, #b08431)" }}>
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account…</>
                    : mode === "rep" ? "Register & Apply" : "Create Account"}
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-[13px] text-[#5c6470] mt-6">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-semibold hover:underline" style={{ color: "#8b5e1b" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
