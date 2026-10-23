"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { updateUserProfile } from "@/lib/firestore";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import {
  GraduationCap, User, Users, Shield, ArrowLeft, ArrowRight,
  CheckCircle, IdCard, Phone,
} from "lucide-react";

type Mode = "solo" | "class" | "rep";

const STEPS = ["Your Details", "Choose Path"];

const GOOGLE_AVATAR_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-500",
];

export default function OnboardingPage() {
  const { user, profile, refetchProfile } = useAuth();
  const router = useRouter();

  const [step,     setStep]     = useState(0);
  const [saving,   setSaving]   = useState(false);
  const [mode,     setMode]     = useState<Mode>("solo");
  const [joinCode, setJoinCode] = useState("");
  const [repForm,  setRepForm]  = useState({ className: "", major: "", reason: "" });
  const [details,  setDetails]  = useState({
    studentId: `STU-${Math.floor(100000 + Math.random() * 900000)}`,
    phone: "",
  });

  // Redirect if not logged in, or already has a profile (existing user)
  useEffect(() => {
    if (!user) { router.replace("/auth/login"); return; }
    if (profile?.onboardingComplete || profile?.role) { router.replace("/dashboard"); }
  }, [user, profile, router]);

  const initials = profile?.displayName
    ?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U";
  const avatarGrad = GOOGLE_AVATAR_COLORS[(profile?.displayName?.charCodeAt(0) ?? 0) % GOOGLE_AVATAR_COLORS.length];

  const validateStep = () => {
    if (step === 1) {
      if (mode === "class" && !joinCode.trim())  { toast.error("Enter a join code"); return false; }
      if (mode === "rep") {
        if (!repForm.className.trim()) { toast.error("Class name is required"); return false; }
        if (!repForm.major.trim())     { toast.error("Major is required"); return false; }
        if (!repForm.reason.trim())    { toast.error("Please explain why you want to be class rep"); return false; }
      }
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  const handleFinish = async () => {
    if (!validateStep() || !user) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        studentId:          details.studentId || undefined,
        phone:              details.phone     || undefined,
        onboardingComplete: true,
      });

      const idToken = await (user as any).getIdToken();

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
        else toast.error("Profile saved but application failed — try again from your profile.");
      }

      await refetchProfile();
      toast.success("Welcome to UniLife!");
      router.push("/dashboard");
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const MODES = [
    {
      key:   "solo" as Mode,
      icon:  User,
      label: "Solo",
      sub:   "Just me — track my own studies",
      colorActive: "border-slate-900 bg-slate-900",
    },
    {
      key:   "class" as Mode,
      icon:  Users,
      label: "Join a Class",
      sub:   "I have a code from my class rep",
      colorActive: "border-blue-600 bg-blue-600",
    },
    {
      key:   "rep" as Mode,
      icon:  Shield,
      label: "Class Rep",
      sub:   "I want to manage a class",
      colorActive: "border-violet-600 bg-violet-600",
    },
  ] as const;

  const headings = [
    { title: "Welcome! Tell us a bit more.",  sub: "These are optional — you can add them later too." },
    { title: "How will you use UniLife?",     sub: "Pick the option that fits you best."              },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-[#f8f9fc]">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between p-14 relative overflow-hidden paper-login-hero"
        style={{ background: "linear-gradient(160deg, rgba(249,242,228,1) 0%, rgba(242,232,214,1) 50%, rgba(238,227,207,1) 100%)" }}>
        {/* Geometric SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="geo-ob" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
              <rect x="4" y="4" width="64" height="64" fill="none" stroke="rgba(210,175,90,0.13)" strokeWidth="0.8"/>
              <rect x="4" y="4" width="64" height="64" fill="none" stroke="rgba(210,175,90,0.10)" strokeWidth="0.6" transform="rotate(45 36 36)"/>
              <rect x="18" y="18" width="36" height="36" fill="none" stroke="rgba(210,175,90,0.10)" strokeWidth="0.6"/>
              <rect x="18" y="18" width="36" height="36" fill="none" stroke="rgba(210,175,90,0.08)" strokeWidth="0.5" transform="rotate(45 36 36)"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#geo-ob)"/>
        </svg>
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full -translate-y-1/2 translate-x-1/2"
          style={{ background: "radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full translate-y-1/2 -translate-x-1/2"
          style={{ background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)" }} />

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-[rgba(156,131,91,0.25)]"
            style={{ background: "rgba(201,168,76,0.16)" }}>
            <GraduationCap className="w-5 h-5" style={{ color: "#8b5e1b" }} />
          </div>
          <div>
            <p className="text-[#30343b] font-bold text-[17px] leading-none tracking-tight">UniLife</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(48,52,59,0.68)" }}>Student Portal</p>
          </div>
        </div>

        <div className="relative z-10">
          {/* User avatar */}
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${avatarGrad} flex items-center justify-center mb-5 shadow-lg`}>
            <span className="text-white text-2xl font-bold">{initials}</span>
          </div>
          <h1 className="text-[32px] font-bold text-white leading-[1.2] mb-3 tracking-tight">
            Hi, {profile?.displayName?.split(" ")[0] || "there"}! 👋
          </h1>
          <p className="text-[15px] mb-10 leading-relaxed max-w-xs" style={{ color: "rgba(48,52,59,0.64)" }}>
            Just a couple of quick steps and you'll be all set. It only takes 30 seconds.
          </p>

          {/* Step list */}
          <div className="flex flex-col gap-4">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300"
                  style={{
                    background: i < step ? "#b98a2e" : i === step ? "#fff" : "rgba(255,255,255,0.08)",
                    color:      i < step ? "#30343b" : i === step ? "#30343b" : "rgba(48,52,59,0.42)",
                  }}>
                  {i < step ? <CheckCircle size={14} /> : i + 1}
                </div>
                <span className="text-sm font-medium transition-all duration-300"
                  style={{ color: i === step ? "#fff" : "rgba(255,255,255,0.3)" }}>{s}</span>
                {i === step && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#b98a2e" }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px]" style={{ color: "rgba(48,52,59,0.42)" }}>Built for students, by students.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto" style={{ background: "#faf8f3" }}>
        <div className="w-full max-w-[420px] py-6">
          {/* Mobile logo + avatar */}
          <div className="flex items-center justify-between mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" }}>
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-slate-900 text-lg tracking-tight">UniLife</span>
            </div>
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center`}>
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
          </div>

          {/* Mobile step dots */}
          <div className="flex items-center gap-2 mb-7 lg:hidden">
            {STEPS.map((_, i) => (
              <div key={i} className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width:      i === step ? 24 : 8,
                  background: i < step ? "#c9a84c" : i === step ? "#b98a2e" : "#e2e8f0",
                }} />
            ))}
          </div>

          {/* Progress bar */}
          <div className="hidden lg:flex items-center gap-2 mb-8">
            <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "#b98a2e" }} />
            </div>
            <span className="text-xs text-gray-400 font-medium shrink-0">Step {step + 1} of {STEPS.length}</span>
          </div>

          {/* Account preview pill */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-gray-100 mb-7 shadow-sm">
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center shrink-0`}>
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{profile?.displayName}</p>
              <p className="text-xs text-slate-400 truncate">{profile?.email}</p>
            </div>
            <CheckCircle size={15} className="text-green-400 shrink-0 ml-auto" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1 tracking-tight">{headings[step].title}</h2>
          <p className="text-slate-500 text-sm mb-7">{headings[step].sub}</p>

          {/* Step content */}
          <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-200">
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <IdCard className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Student ID <span className="text-gray-300 font-normal">(optional)</span></label>
                    <input type="text" placeholder="Auto-generated"
                      value={details.studentId}
                      onChange={e => setDetails(p => ({ ...p, studentId: e.target.value }))}
                      autoFocus
                      className="w-full text-sm text-slate-800 outline-none placeholder:text-gray-300" />
                    <p className="text-[10px] text-gray-400 mt-0.5">Auto-generated — replace with your real ID if you have one</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100">
                  <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Phone <span className="text-gray-300 font-normal">(optional)</span></label>
                    <input type="tel" placeholder="e.g. 012 345 678"
                      value={details.phone}
                      onChange={e => setDetails(p => ({ ...p, phone: e.target.value }))}
                      className="w-full text-sm text-slate-800 outline-none placeholder:text-gray-300" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-center">You can update these anytime from your profile.</p>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3">
                  {MODES.map(({ key, icon: Icon, label, sub, colorActive }) => {
                    const active = mode === key;
                    return (
                      <button key={key} type="button" onClick={() => setMode(key)}
                        className={`flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-all ${
                          active ? `${colorActive} text-white` : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                        }`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          active ? "bg-white/15" : "bg-gray-100"
                        }`}>
                          <Icon size={18} className={active ? "text-white" : "text-gray-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${active ? "text-white" : "text-gray-800"}`}>{label}</p>
                          <p className={`text-xs mt-0.5 ${active ? "text-white/70" : "text-gray-400"}`}>{sub}</p>
                        </div>
                        {active && <CheckCircle size={16} className="text-white/80 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {mode === "class" && (
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-2 mt-1">
                    <label className="text-sm font-medium text-blue-800 block">Join Code *</label>
                    <input type="text" placeholder="e.g. CS2024" autoFocus
                      value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={8}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-200 bg-white text-sm font-mono uppercase tracking-widest outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    <p className="text-xs text-blue-500">Ask your class representative for the code.</p>
                  </div>
                )}

                {mode === "rep" && (
                  <div className="p-4 bg-violet-50 rounded-2xl border border-violet-100 space-y-3 mt-1">
                    <p className="text-xs text-violet-700 font-medium leading-relaxed">
                      You'll be promoted to Class Rep once a super admin approves your application.
                    </p>
                    <input type="text" placeholder="Class name (e.g. Computer Science — Batch 2024)" autoFocus
                      value={repForm.className}
                      onChange={e => setRepForm(p => ({ ...p, className: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    <input type="text" placeholder="Major / Faculty"
                      value={repForm.major}
                      onChange={e => setRepForm(p => ({ ...p, major: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    <textarea placeholder="Why do you want to be a class representative?" rows={3}
                      value={repForm.reason}
                      onChange={e => setRepForm(p => ({ ...p, reason: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 resize-none" />
                  </div>
                )}

                {mode === "solo" && (
                  <p className="text-xs text-gray-400 text-center mt-1">You can join a class later from your profile.</p>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button onClick={back}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                <ArrowLeft size={15} /> Back
              </button>
            )}
            <div className="flex-1">
              {step < STEPS.length - 1 ? (
                <button onClick={next}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" }}>
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <button onClick={handleFinish} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" }}>
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : null}
                  {mode === "rep" ? "Finish & Apply" : "Go to Dashboard"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
