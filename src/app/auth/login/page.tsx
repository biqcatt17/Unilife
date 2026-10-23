"use client";

import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { getUserProfile } from "@/lib/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Eye, EyeOff, GraduationCap } from "lucide-react";

// ── Quotes inspired by universal wisdom (from Islamic tradition, presented timelessly) ──
const QUOTES = [
  {
    text: "Seek knowledge from the cradle to the grave.",
    sub:  "The pursuit of learning has no finish line.",
  },
  {
    text: "An hour of reflection is worth more than a year without thought.",
    sub:  "Stillness and intention shape every great journey.",
  },
  {
    text: "The best of people are those who bring the most benefit to others.",
    sub:  "Purpose turns effort into meaning.",
  },
  {
    text: "Whoever travels a path in search of knowledge, the path becomes easy.",
    sub:  "Dedication opens doors that seemed closed.",
  },
];

// ── Islamic geometric SVG tile ────────────────────────────────
function GeoBg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="geo-login" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
          {/* Outer square */}
          <rect x="4" y="4" width="64" height="64" fill="none"
            stroke="rgba(210,175,90,0.13)" strokeWidth="0.8" />
          {/* Rotated square (diamond) */}
          <rect x="4" y="4" width="64" height="64" fill="none"
            stroke="rgba(210,175,90,0.10)" strokeWidth="0.6"
            transform="rotate(45 36 36)" />
          {/* Inner ring */}
          <rect x="18" y="18" width="36" height="36" fill="none"
            stroke="rgba(210,175,90,0.10)" strokeWidth="0.6" />
          {/* Centre diamond */}
          <rect x="18" y="18" width="36" height="36" fill="none"
            stroke="rgba(210,175,90,0.08)" strokeWidth="0.5"
            transform="rotate(45 36 36)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#geo-login)" />
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

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [gLoading,  setGLoading]  = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [qIdx,     setQIdx]     = useState(0);
  const [fade,     setFade]     = useState(true);

  // Rotate quotes every 5 s
  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setQIdx(i => (i + 1) % QUOTES.length);
        setFade(true);
      }, 400);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleLogin = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Please fill in all fields");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch {
      toast.error("Incorrect email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) return toast.error("Enter your email above first");
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      toast.success("Reset link sent — check your inbox");
    } catch {
      toast.error("Couldn't send reset email. Check the address.");
    }
  };

  const handleGoogle = async () => {
    setGLoading(true);
    try {
      const result  = await signInWithPopup(auth, googleProvider);
      const profile = await getUserProfile(result.user.uid);

      if (!profile) {
        // Brand-new Google user — create profile and send to onboarding
        const { createUserProfile } = await import("@/lib/firestore");
        await createUserProfile({
          uid:         result.user.uid,
          email:       result.user.email!,
          displayName: result.user.displayName || "Student",
          role:        "student",
          createdAt:   new Date().toISOString(),
        });
        router.push("/auth/onboarding");
        return;
      }

      // Existing user — always go straight to dashboard
      router.push("/dashboard");
    } catch {
      toast.error("Google sign-in failed. Try again.");
    } finally {
      setGLoading(false);
    }
  };

  const q = QUOTES[qIdx];

  return (
    <div className="min-h-screen flex font-sans">

      {/* ── Left panel ──────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[48%] flex-col justify-between p-14 relative overflow-hidden paper-login-hero"
        style={{ background: "linear-gradient(160deg, rgba(249,242,228,1) 0%, rgba(242,232,214,1) 50%, rgba(238,227,207,1) 100%)" }}
      >
        <GeoBg />

        {/* Top glow */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full -translate-y-1/2 translate-x-1/2"
          style={{ background: "radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)" }} />
        {/* Bottom glow */}
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

        {/* Quote */}
        <div className="relative z-10">
          {/* Decorative line */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px w-8" style={{ background: "#b98a2e" }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#b98a2e" }} />
          </div>

          <div
            className="transition-all duration-400"
            style={{ opacity: fade ? 1 : 0, transform: fade ? "translateY(0)" : "translateY(8px)" }}
          >
            <blockquote
              className="text-[28px] font-bold leading-[1.25] mb-4 tracking-tight"
              style={{ color: "#30343b" }}
            >
              "{q.text}"
            </blockquote>
            <p className="text-[14px]" style={{ color: "rgba(48,52,59,0.64)" }}>
              {q.sub}
            </p>
          </div>

          {/* Quote dots */}
          <div className="flex gap-1.5 mt-10">
            {QUOTES.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFade(false); setTimeout(() => { setQIdx(i); setFade(true); }, 400); }}
                className="rounded-full transition-all duration-300"
                style={{
                  width:  i === qIdx ? 20 : 6,
                  height: 6,
                  background: i === qIdx ? "#b98a2e" : "rgba(201,168,76,0.25)",
                }}
              />
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px]" style={{ color: "rgba(48,52,59,0.42)" }}>
          Built for students, by students.
        </p>
      </div>

      {/* ── Right panel ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12" style={{ background: "rgba(250,248,241,0.9)" }}>
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border"
              style={{ background: "linear-gradient(135deg, #d7b462, #c18d2a)", borderColor: "rgba(156,131,91,0.25)" }}>
              <GraduationCap className="w-5 h-5 text-[#fffaf0]" />
            </div>
            <span className="font-bold text-[#30343b] text-lg tracking-tight">UniLife</span>
          </div>

          {/* Heading */}
          <h2 className="text-[3rem] leading-none text-[#30343b] mb-1 tracking-tight handwritten">Welcome back</h2>
          <p className="text-[#5c6470] text-sm mb-8">Sign in to continue your journey</p>

          {/* Google */}
          <button
            onClick={handleGoogle} disabled={gLoading}
            className="paper-button w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-[#30343b] bg-white border border-[rgba(48,52,59,0.12)] hover:border-[rgba(48,52,59,0.18)] hover:shadow-md transition-all duration-200 mb-5 disabled:opacity-50"
          >
            {gLoading
              ? <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              : GOOGLE_SVG}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-[rgba(48,52,59,0.12)]" />
            <span className="text-[11px] text-[#5c6470] font-medium tracking-wide">OR</span>
            <div className="flex-1 h-px bg-[rgba(48,52,59,0.12)]" />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
              <input
                type="email" placeholder="you@university.edu"
                value={email} onChange={e => setEmail(e.target.value)}
                className="paper-input w-full px-4 py-3 text-sm text-slate-800 placeholder:text-slate-300"
              />
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="paper-input w-full px-4 py-3 pr-11 text-sm text-slate-800 placeholder:text-slate-300"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex justify-end -mt-1">
              {resetSent ? (
                <span className="text-[12px] text-emerald-600 font-medium">✓ Reset link sent</span>
              ) : (
                <button type="button" onClick={handleForgotPassword}
                  className="text-[12px] font-medium transition-colors hover:underline"
                  style={{ color: "#b98a2e" }}>
                  Forgot password?
                </button>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              className="paper-button mt-1 w-full py-3 rounded-2xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-60 hover:brightness-110 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #b98a2e, #8b5e1b)" }}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                : "Sign In"}
            </button>
          </form>

          <p className="text-center text-[13px] text-slate-400 mt-8">
            Don&apos;t have an account?{" "}
            <Link href="/auth/register" className="font-semibold hover:underline" style={{ color: "#b98a2e" }}>
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
