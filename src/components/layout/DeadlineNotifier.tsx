"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getUserTasks } from "@/lib/firestore";
import { Task } from "@/types";
import { Bell, X, ChevronRight } from "lucide-react";
import Link from "next/link";

function urgencyLabel(daysLeft: number) {
  if (daysLeft < 0)  return { text: "Overdue",   color: "text-red-600",    bg: "bg-red-50",    dot: "bg-red-500"    };
  if (daysLeft === 0) return { text: "Due today", color: "text-orange-600", bg: "bg-orange-50", dot: "bg-orange-500" };
  if (daysLeft === 1) return { text: "Tomorrow",  color: "text-amber-600",  bg: "bg-amber-50",  dot: "bg-amber-400"  };
  return                     { text: `${daysLeft}d left`, color: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-400" };
}

export default function DeadlineNotifier() {
  const { user } = useAuth();
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [open,    setOpen]    = useState(false);
  const panelRef              = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!user) return;
    getUserTasks(user.uid).then(all => {
      const pending = all.filter(t => t.status !== "completed");
      // Show tasks due within 3 days or overdue
      const soon = pending.filter(t => {
        const diff = daysDiff(t.dueDate, today);
        return diff <= 3;
      }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      setTasks(soon);

      // Browser notifications for today/tomorrow
      if (Notification.permission === "granted") {
        fireBrowserNotifications(soon, today);
      } else if (Notification.permission === "default") {
        Notification.requestPermission().then(perm => {
          if (perm === "granted") fireBrowserNotifications(soon, today);
        });
      }
    }).catch(console.error);
  }, [user, today]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const count = tasks.length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl text-[#30343b]/80 hover:text-[#30343b] hover:bg-[#f7efe0] transition-colors border border-[#e9e1d1] bg-white/70 shadow-sm"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#f28b82] rounded-full text-[10px] text-white font-bold flex items-center justify-center leading-none shadow-sm">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-11 w-80 paper-card z-50 overflow-hidden bg-[#fffdf8] border border-[#e8e1d1]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#efe6d7] bg-[#f7f2e8]">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-[#5a5a52]" />
              <p className="text-sm font-bold text-[#30343b] handwritten text-[1.3rem] leading-none">Upcoming Deadlines</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#77766f] hover:text-[#30343b]">
              <X size={15} />
            </button>
          </div>

          {/* Task list */}
          {tasks.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-2">
                <Bell size={16} className="text-green-500" />
              </div>
              <p className="text-sm text-[#30343b] font-medium">All caught up</p>
              <p className="text-xs text-[#77766f] mt-0.5">No tasks due in the next 3 days</p>
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-[#f3ead9]">
              {tasks.map(task => {
                const diff = daysDiff(task.dueDate, today);
                const u    = urgencyLabel(diff);
                return (
                  <li key={task.id} className={`px-4 py-3 ${u.bg} hover:brightness-95 transition-all`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${u.dot}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{task.title}</p>
                          <p className={`text-xs font-medium mt-0.5 ${u.color}`}>{u.text}</p>
                          <p className="text-xs text-gray-400">Due {task.dueDate}</p>
                        </div>
                      </div>
                      {task.priority && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          task.priority === "high"   ? "bg-red-100 text-red-600" :
                          task.priority === "medium" ? "bg-amber-100 text-amber-600" :
                                                       "bg-gray-100 text-gray-500"
                        }`}>
                          {task.priority}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Footer */}
          <Link
            href="/tasks"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-4 py-3 border-t border-[#efe6d7] text-sm font-medium text-[#1e4a3f] hover:bg-[#f4efe6] transition-colors"
          >
            View all tasks
            <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function daysDiff(dueDate: string, today: string) {
  const due = new Date(dueDate).getTime();
  const now = new Date(today).getTime();
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

const notifiedKey = "unilife_notified_";

function fireBrowserNotifications(tasks: Task[], today: string) {
  tasks.forEach(task => {
    const diff = daysDiff(task.dueDate, today);
    if (diff > 1) return; // only notify for today and tomorrow
    const key = `${notifiedKey}${task.id}_${today}`;
    if (sessionStorage.getItem(key)) return; // only once per session
    sessionStorage.setItem(key, "1");

    const title = diff < 0  ? `Overdue: ${task.title}`
                : diff === 0 ? `Due today: ${task.title}`
                :              `Due tomorrow: ${task.title}`;
    const body  = `Due ${task.dueDate}${task.priority ? ` · ${task.priority} priority` : ""}`;
    new Notification(title, { body, icon: "/favicon.ico" });
  });
}
