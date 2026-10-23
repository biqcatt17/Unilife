"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import DeadlineNotifier from "./DeadlineNotifier";
import { useFCM } from "@/hooks/useFCM";
import { getUserTasks } from "@/lib/firestore";
import { Menu, GraduationCap } from "lucide-react";

function HeaderPet({ taskCount, isFocusMode }: { taskCount: number; isFocusMode: boolean }) {
  const mood = isFocusMode ? "focus" : taskCount > 4 ? "busy" : taskCount > 0 ? "alert" : "sleeping";
  const label = isFocusMode ? "Focus" : taskCount > 4 ? `${taskCount} tasks` : taskCount > 0 ? "Busy" : "Chill";
  const bubbleText = isFocusMode ? "Focus!" : taskCount > 4 ? "So much to do!" : taskCount > 0 ? "Let’s go!" : "Zzz...";

  return (
    <div className="flex items-center gap-2.5 mr-2 md:mr-3">
      <div className="relative flex items-center">
        <div className="speech-bubble" aria-hidden="true">{bubbleText}</div>
        <div className={`pet-shell ${mood}`} title={label} aria-label={label}>
          <div className="pet-body">
            <div className="pet-ear left" />
            <div className="pet-ear right" />
            <div className="pet-face">
              <span className="pet-eye left" />
              <span className="pet-eye right" />
              <span className="pet-mouth" />
            </div>
            <span className="pet-pulse" />
          </div>
        </div>
      </div>

      <div className="hidden sm:flex flex-col leading-none">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">Status</span>
        <span className="text-[11px] font-semibold text-slate-700">{label}</span>
      </div>

      <style jsx>{`
        .pet-shell {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fffaf0, #f4ebdc);
          border: 1px solid rgba(143, 126, 96, 0.18);
          box-shadow: 0 8px 18px rgba(48, 52, 59, 0.08);
          animation: pet-bob 2.8s ease-in-out infinite;
        }

        .pet-shell.busy { animation-duration: 1.1s; }
        .pet-shell.focus { animation-duration: 1.7s; }
        .pet-shell.sleeping { animation-duration: 3.5s; }

        .pet-body {
          position: relative;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f6c46b, #d59a38);
          box-shadow: inset 0 -3px 0 rgba(120, 86, 20, 0.14);
        }

        .pet-ear {
          position: absolute;
          top: -5px;
          width: 8px;
          height: 10px;
          background: #d89a36;
          border-radius: 12px 12px 0 0;
          box-shadow: inset 0 -1px 0 rgba(120, 86, 20, 0.12);
        }

        .pet-ear.left { left: 2px; transform: rotate(-30deg); }
        .pet-ear.right { right: 2px; transform: rotate(30deg); }

        .pet-face {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          z-index: 2;
        }

        .pet-eye {
          display: block;
          width: 3px;
          height: 3px;
          background: rgba(52, 37, 16, 0.9);
          border-radius: 50%;
          transform-origin: center;
          animation: pet-blink 4s infinite;
        }

        .pet-shell.sleeping .pet-eye {
          width: 2.5px;
          height: 2.5px;
          opacity: 0.6;
          transform: scaleY(0.75);
        }

        .pet-mouth {
          position: absolute;
          bottom: 5px;
          width: 8px;
          height: 5px;
          border-bottom: 2px solid rgba(52, 37, 16, 0.8);
          border-radius: 0 0 12px 12px;
        }

        .pet-shell.sleeping .pet-mouth {
          width: 6px;
          height: 3px;
          border-bottom: 1.5px solid rgba(52, 37, 16, 0.75);
        }

        .pet-shell.busy .pet-body {
          animation: pet-wiggle 0.75s ease-in-out infinite;
          transform-origin: center bottom;
        }

        .pet-shell.focus .pet-body {
          animation: pet-wave 1.3s ease-in-out infinite;
          transform-origin: center bottom;
        }

        .pet-shell.sleeping .pet-body {
          animation: pet-sleep 2.4s ease-in-out infinite;
        }

        .pet-pulse {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 1.5px solid rgba(244, 180, 92, 0.5);
          opacity: 0;
          animation: pet-pulse 2s ease-out infinite;
        }

        .pet-shell.sleeping .pet-pulse {
          animation: none;
          opacity: 0;
        }

        .speech-bubble {
          position: absolute;
          right: 34px;
          top: -9px;
          transform: translateY(-2px);
          padding: 4px 7px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.97);
          border: 1px solid rgba(143, 126, 96, 0.16);
          box-shadow: 0 6px 16px rgba(48, 52, 59, 0.08);
          color: #5c5a54;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.02em;
          white-space: nowrap;
          animation: bubble-pop 2.6s ease-in-out infinite;
        }

        .speech-bubble::after {
          content: "";
          position: absolute;
          right: -5px;
          top: 8px;
          width: 8px;
          height: 8px;
          background: rgba(255, 255, 255, 0.97);
          border-right: 1px solid rgba(143, 126, 96, 0.16);
          border-bottom: 1px solid rgba(143, 126, 96, 0.16);
          transform: rotate(-45deg);
        }

        @keyframes pet-bob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
        }

        @keyframes pet-wiggle {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(-8deg) scale(1.04); }
          75% { transform: rotate(8deg) scale(1.04); }
        }

        @keyframes pet-wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
          75% { transform: rotate(-2deg); }
        }

        @keyframes pet-sleep {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(2px) scale(0.97); }
        }

        @keyframes pet-blink {
          0%, 45%, 47%, 100% { transform: scaleY(1); }
          46% { transform: scaleY(0.1); }
        }

        @keyframes pet-pulse {
          0% { opacity: 0; transform: scale(0.9); }
          20% { opacity: 0.8; }
          100% { opacity: 0; transform: scale(1.35); }
        }

        @keyframes bubble-pop {
          0%, 100% { transform: translateY(-2px); opacity: 0.9; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function DashboardLayout({
  children,
  noPadding = false,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  const { user, loading } = useAuth();
  useFCM(user?.uid);
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [taskCount, setTaskCount] = useState(0);
  const pathname = usePathname();
  const isFocusMode = pathname.startsWith("/focus");

  useEffect(() => {
    if (!loading && !user) router.push("/auth/login");
  }, [user, loading, router]);

  // Close sidebar whenever the route changes (mobile nav tap)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;

    getUserTasks(user.uid)
      .then((tasks) => {
        const pending = tasks.filter((task) => task.status !== "completed");
        setTaskCount(pending.length);
      })
      .catch(() => setTaskCount(0));
  }, [user, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf8f3" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "rgba(201,168,76,0.2)", borderTopColor: "#b98a2e" }} />
          <p className="text-sm" style={{ color: "rgba(14,51,38,0.4)" }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex notebook-shell" style={{ background: "#faf8f1" }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 w-full">

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 h-14 shrink-0 notebook-header"
          style={{ background: "rgba(255, 253, 247, 0.9)", borderColor: "rgba(118, 104, 82, 0.16)", boxShadow: "0 8px 18px rgba(48, 52, 59, 0.04)" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "#5c635d", background: "rgba(255,255,255,0.5)" }}>
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded-md flex items-center justify-center border"
              style={{ background: "rgba(201,168,76,0.12)", borderColor: "rgba(170, 138, 69, 0.18)" }}>
              <GraduationCap size={13} style={{ color: "#a6731d" }} />
            </div>
            <span className="font-bold text-[15px] tracking-tight handwritten text-[#30343b]">UniLife</span>
          </div>
          <HeaderPet taskCount={taskCount} isFocusMode={isFocusMode} />
          <DeadlineNotifier />
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-end px-8 h-11 shrink-0 sticky top-0 z-20 notebook-header"
          style={{ background: "linear-gradient(180deg, rgba(255,253,247,0.96) 0%, rgba(250,245,234,0.9) 100%)", borderColor: "rgba(118, 104, 82, 0.14)", boxShadow: "0 8px 18px rgba(48, 52, 59, 0.04)" }}>
          <div className="flex items-center gap-3 ml-auto">
            <HeaderPet taskCount={taskCount} isFocusMode={isFocusMode} />
            <DeadlineNotifier />
          </div>
        </header>

        {/* Page content */}
        <main className={noPadding ? "flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7" : "flex-1 p-4 sm:p-6 lg:p-8"}>
          <div key={pathname} className="page-fade h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
