"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "@/hooks/useNotifications";

/**
 * Shows a dismissible banner prompting the user to enable notifications
 * if they haven't granted permission yet.
 */
export default function NotificationBanner() {
  const [permission, setPermission] = useState<string>("default");
  const [dismissed,  setDismissed]  = useState(false);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    const p = getNotificationPermission();
    setPermission(p);
    // Also hide if already decided
    if (p !== "default") setDismissed(true);
    // Hide if user dismissed in this session
    if (sessionStorage.getItem("notif-dismissed")) setDismissed(true);
  }, []);

  if (dismissed || permission === "granted" || permission === "denied" || permission === "unsupported") {
    return null;
  }

  const handleEnable = async () => {
    setLoading(true);
    const p = await requestNotificationPermission();
    setPermission(p);
    setDismissed(true);
    setLoading(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("notif-dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="paper-card flex items-center gap-3 bg-[#edf5ff] border border-blue-100 rounded-2xl px-4 py-3 mb-5">
      <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
        <Bell size={15} className="text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-blue-900">Enable reminders</p>
        <p className="text-[12px] text-blue-600">Get notified about tasks due today and upcoming events.</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleEnable}
          disabled={loading}
          className="paper-button px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
          {loading ? "Enabling…" : "Enable"}
        </button>
        <button onClick={handleDismiss}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-100 transition-colors">
          <X size={14} className="text-blue-400" />
        </button>
      </div>
    </div>
  );
}

/**
 * Fires browser notifications for tasks and events when the dashboard loads.
 * Call this inside DashboardPage once data is loaded.
 */
export function useDashboardNotifications(
  tasks: { title: string; dueDate: string; status: string }[],
  events: { title: string; eventDate: string }[],
) {
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const today    = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const key = `notif-fired-${today}`;
    if (sessionStorage.getItem(key)) return; // only fire once per day
    sessionStorage.setItem(key, "1");

    const overdue = tasks.filter(t => t.status !== "completed" && t.dueDate < today);
    const dueToday = tasks.filter(t => t.status !== "completed" && t.dueDate === today);
    const dueTomorrow = tasks.filter(t => t.status !== "completed" && t.dueDate === tomorrow);
    const todayEvents = events.filter(e => e.eventDate.startsWith(today));

    const fire = (title: string, body: string) => {
      try { new Notification(title, { body, icon: "/favicon.ico" }); } catch {}
    };

    if (overdue.length > 0) {
      fire("⚠️ Overdue tasks", `${overdue.length} task${overdue.length > 1 ? "s are" : " is"} overdue: ${overdue.slice(0,2).map(t=>t.title).join(", ")}`);
    }
    if (dueToday.length > 0) {
      fire("📋 Due today", `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today: ${dueToday.slice(0,2).map(t=>t.title).join(", ")}`);
    }
    if (dueTomorrow.length > 0) {
      fire("🗓️ Due tomorrow", `${dueTomorrow.slice(0,2).map(t=>t.title).join(", ")} due tomorrow`);
    }
    if (todayEvents.length > 0) {
      fire("📅 Event today", todayEvents.slice(0,2).map(e=>e.title).join(", "));
    }
  }, [tasks, events]);
}
