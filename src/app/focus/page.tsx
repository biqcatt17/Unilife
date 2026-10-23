"use client";

import {
  useEffect, useRef, useState, useCallback,
} from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  getUserCourses, getUserTasks, updateTask,
  getFocusNotes, saveFocusNote, updateFocusNote, deleteFocusNote, createStudyLog,
} from "@/lib/firestore";
import { Course, Task } from "@/types";
import {
  Play, Pause, RotateCcw, CheckCircle2,
  Volume2, VolumeX, Target, AlertTriangle,
  NotebookPen, ListTodo, BarChart2, Pencil, SkipForward,
  Plus, Trash2, ChevronLeft, Maximize2, Minimize2, X,
  PanelBottomOpen, Music2, Wind, CloudRain, Waves, Coffee,
  Trees, Radio, Music, CheckCheck,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Themes ───────────────────────────────────────────────────
const THEMES = [
  { key: "paper",   label: "Paper",   dot: "#c9a84c",
    bg: "linear-gradient(135deg,#f8f1e7 0%,#f4e5c8 48%,#f8f3eb 100%)",
    card: "rgba(255,255,255,0.76)", border: "rgba(48,52,59,0.12)",
    text: "#30343b", muted: "#5d6773", accent: "#b98a2e",
    timerColor: "#c9a84c", trackColor: "rgba(48,52,59,0.08)" },
  { key: "sage",    label: "Sage",    dot: "#6a7d5f",
    bg: "linear-gradient(135deg,#eef3ea 0%,#ddeadc 48%,#f3f0e8 100%)",
    card: "rgba(255,255,255,0.74)", border: "rgba(48,52,59,0.12)",
    text: "#30343b", muted: "#586b5a", accent: "#44614b",
    timerColor: "#6a7d5f", trackColor: "rgba(48,52,59,0.08)" },
  { key: "clay",    label: "Clay",    dot: "#b66b4d",
    bg: "linear-gradient(135deg,#f9efe9 0%,#eed7c5 48%,#f8f2eb 100%)",
    card: "rgba(255,255,255,0.74)", border: "rgba(48,52,59,0.12)",
    text: "#30343b", muted: "#74615b", accent: "#8d5b4d",
    timerColor: "#b66b4d", trackColor: "rgba(48,52,59,0.08)" },
  { key: "mist",    label: "Mist",    dot: "#7ea3b4",
    bg: "linear-gradient(135deg,#eef4f6 0%,#dfe9ee 48%,#f7f2eb 100%)",
    card: "rgba(255,255,255,0.76)", border: "rgba(48,52,59,0.12)",
    text: "#30343b", muted: "#5d7380", accent: "#527083",
    timerColor: "#7ea3b4", trackColor: "rgba(48,52,59,0.08)" },
  { key: "minimal", label: "Canvas", dot: "#b98a2e",
    bg: "#f7f2ea",
    card: "#ffffff", border: "rgba(48,52,59,0.12)",
    text: "#30343b", muted: "#667085", accent: "#b98a2e",
    timerColor: "#b98a2e", trackColor: "rgba(48,52,59,0.08)" },
] as const;
type ThemeKey = typeof THEMES[number]["key"];

// ─── Timer modes ──────────────────────────────────────────────
const MODES = [
  { key: "focus", label: "Focus",       defaultMins: 25 },
  { key: "short", label: "Short Break", defaultMins: 5  },
  { key: "long",  label: "Long Break",  defaultMins: 15 },
] as const;
type ModeKey = typeof MODES[number]["key"];

// ─── Sounds ───────────────────────────────────────────────────
const SOUNDS = [
  { key: "none",   label: "None",        icon: VolumeX    },
  { key: "brown",  label: "Brown Noise", icon: Wind       },
  { key: "rain",   label: "Rain",        icon: CloudRain  },
  { key: "ocean",  label: "Ocean",       icon: Waves      },
  { key: "cafe",   label: "Café",        icon: Coffee     },
  { key: "forest", label: "Forest",      icon: Trees      },
  { key: "white",  label: "White Noise", icon: Radio      },
] as const;
type SoundKey = typeof SOUNDS[number]["key"];

// ─── Session record ───────────────────────────────────────────
interface SessionRecord { mins: number; at: string; }

// ─── Human phrases ────────────────────────────────────────────
function getPhrase(modeKey: ModeKey, running: boolean, sessions: number) {
  if (modeKey === "short" || modeKey === "long") {
    const b = ["Step away. You've earned it.", "Rest is part of the work.", "Breathe. Stretch. Come back stronger."];
    return b[sessions % b.length];
  }
  if (!running && sessions === 0) return "Ready when you are. Let's make this count.";
  if (!running && sessions > 0)   return `${sessions} session${sessions > 1 ? "s" : ""} done. Keep the momentum going.`;
  const f = ["Stay with it. One word at a time.", "Deep work. Full presence.", "You're in the zone. Don't stop now."];
  return f[sessions % f.length];
}

// ─── Web Audio sound engine ───────────────────────────────────
function useSoundEngine() {
  const ctxRef    = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const stoppers  = useRef<(() => void)[]>([]);

  const stop = useCallback(() => {
    stoppers.current.forEach(fn => { try { fn(); } catch {} });
    stoppers.current = [];
    masterRef.current?.disconnect();
    masterRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
  }, []);

  const play = useCallback((type: SoundKey, vol: number) => {
    stop();
    if (type === "none") return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx() as AudioContext;
    const master = ctx.createGain();
    master.gain.value = vol;
    master.connect(ctx.destination);
    ctxRef.current   = ctx;
    masterRef.current = master;
    const sr  = ctx.sampleRate;
    const len = sr * 4;
    const makeBuf = (fill: (d: Float32Array) => void) => {
      const b = ctx.createBuffer(1, len, sr);
      fill(b.getChannelData(0));
      return b;
    };
    const loopSrc = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      stoppers.current.push(() => s.stop());
      return s;
    };
    const whiteBuf = makeBuf(d => { for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; });
    const brownBuf = makeBuf(d => {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        d[i] = (last + 0.02 * w) / 1.02; last = d[i]; d[i] *= 3.5;
      }
    });
    const connect = (src: AudioNode, ...nodes: AudioNode[]) => {
      let prev = src;
      nodes.forEach(n => { prev.connect(n); prev = n; });
      (prev as AudioNode).connect(master);
    };
    if (type === "white") {
      const g = ctx.createGain(); g.gain.value = 0.35;
      const s = loopSrc(whiteBuf); connect(s, g); s.start();
    } else if (type === "brown") {
      const g = ctx.createGain(); g.gain.value = 0.5;
      const s = loopSrc(brownBuf); connect(s, g); s.start();
    } else if (type === "rain") {
      const g = ctx.createGain(); g.gain.value = 0.55;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.4;
      const s = loopSrc(whiteBuf); connect(s, bp, g); s.start();
      const g2 = ctx.createGain(); g2.gain.value = 0.2;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300;
      const s2 = loopSrc(brownBuf); connect(s2, lp, g2); s2.start();
    } else if (type === "ocean") {
      const g = ctx.createGain(); g.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.22;
      lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
      stoppers.current.push(() => lfo.stop());
      const s = loopSrc(brownBuf); connect(s, g); s.start();
    } else if (type === "cafe") {
      [[250, 1.2, 0.18], [800, 2, 0.12], [2200, 3, 0.07]].forEach(([freq, Q, gain]) => {
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = Q;
        const g = ctx.createGain(); g.gain.value = gain;
        const s = loopSrc(whiteBuf); connect(s, bp, g); s.start();
      });
    } else if (type === "forest") {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
      const g = ctx.createGain(); g.gain.value = 0.35;
      const s = loopSrc(brownBuf); connect(s, lp, g); s.start();
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
      const g2 = ctx.createGain(); g2.gain.value = 0.08;
      const s2 = loopSrc(whiteBuf); connect(s2, hp, g2); s2.start();
    }
  }, [stop]);

  const setVol = useCallback((v: number) => {
    if (masterRef.current) masterRef.current.gain.value = v;
  }, []);

  useEffect(() => () => stop(), [stop]);
  return { play, stop, setVol };
}

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;


// ─── Timer ring ───────────────────────────────────────────────
function Ring({ pct, color, track, size = 240, running = false }: {
  pct: number; color: string; track: string; size?: number; running?: boolean;
}) {
  const sw = 7, r = (size - sw) / 2, cx = size / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90"
      style={{ filter: running ? `drop-shadow(0 0 24px ${color}66)` : `drop-shadow(0 0 10px ${color}33)`,
               transition: "filter 0.8s ease" }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={track} strokeWidth={sw} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

// ─── Session timeline strip ───────────────────────────────────
function SessionStrip({ records, goal, accent, track, muted }:
  { records: SessionRecord[]; goal: number; accent: string; track: string; muted: string }) {
  const slots = Math.max(goal, records.length);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1.5">
        {Array.from({ length: slots }).map((_, i) => {
          const rec = records[i];
          return (
            <div key={i}
              className="relative group"
              title={rec ? `${rec.mins} min · ${rec.at}` : undefined}>
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: rec ? 28 : 20,
                  background: rec ? accent : track,
                  opacity: rec ? 1 : 0.4,
                  boxShadow: rec ? `0 0 6px ${accent}66` : "none",
                }}
              />
              {rec && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex
                  whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded-md z-10"
                  style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                  {rec.mins}m
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-[11px]" style={{ color: muted }}>
        {records.length}/{goal}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function FocusPage() {
  const { user } = useAuth();

  const [themeKey,    setThemeKey]    = useState<ThemeKey>("paper");
  const theme = THEMES.find(t => t.key === themeKey)!;

  const [modeKey,     setModeKey]     = useState<ModeKey>("focus");
  const [customMins,  setCustomMins]  = useState<Record<ModeKey, number>>({ focus: 25, short: 5, long: 15 });
  const [editingMode, setEditingMode] = useState<ModeKey | null>(null);
  const [editingVal,  setEditingVal]  = useState("");
  const [secsLeft,    setSecsLeft]    = useState(25 * 60);
  const [running,     setRunning]     = useState(false);
  const [sessions,    setSessions]    = useState(0);
  const [sessionGoal, setSessionGoal] = useState(4);
  const [sessionLog,  setSessionLog]  = useState<SessionRecord[]>([]);
  const [autoBreak,   setAutoBreak]   = useState(true);
  const [goal,        setGoal]        = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [reflection,  setReflection]  = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mode        = MODES.find(m => m.key === modeKey)!;
  const currentMins = customMins[modeKey];
  const total       = currentMins * 60;
  const elapsed     = total - secsLeft;

  const [soundKey, setSoundKey] = useState<SoundKey>("none");
  const [volume,   setVolume]   = useState(0.4);
  const [muted,    setMuted]    = useState(false);
  const { play, stop, setVol } = useSoundEngine();

  const [noteId,    setNoteId]    = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody,  setNoteBody]  = useState("");
  const [noteSaved, setNoteSaved] = useState(true);
  const [allNotes,  setAllNotes]  = useState<import("@/types").FocusNote[]>([]);
  const [notesView, setNotesView] = useState<"list" | "edit">("list");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [courses,    setCourses]    = useState<Course[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [logCourse,  setLogCourse]  = useState("");

  const [panel,       setPanel]       = useState<"notes" | "tasks" | "stats">("notes");
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);

  // ── Music player ──────────────────────────────────────────
  interface Track { src: string; name: string; }
  const [playlist,     setPlaylist]     = useState<Track[]>([]);
  const [trackIdx,     setTrackIdx]     = useState(0);
  const [mp3Playing,   setMp3Playing]   = useState(false);
  const [showMusic,    setShowMusic]    = useState(false);
  const [pasteMode,    setPasteMode]    = useState(false);
  const [pasteText,    setPasteText]    = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── YouTube player ────────────────────────────────────────
  const [ytInput,      setYtInput]      = useState("");
  const [ytEmbedSrc,   setYtEmbedSrc]   = useState("");
  const [showYt,       setShowYt]       = useState(false);

  // ── Idle dim state ────────────────────────────────────────
  const [idle, setIdle]   = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdle = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current!);
    idleTimer.current = setTimeout(() => setIdle(true), 30_000);
  }, []);

  useEffect(() => {
    resetIdle();
    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("keydown",   resetIdle);
    return () => {
      clearTimeout(idleTimer.current!);
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("keydown",   resetIdle);
    };
  }, [resetIdle]);

  const today = new Date().toISOString().split("T")[0];

  // ── Load data ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    Promise.all([
      getUserTasks(user.uid),
      getUserCourses(user.uid),
      getFocusNotes(user.uid),
    ]).then(([t, c, notes]) => {
      setTasks(t.filter(x => x.status !== "completed"));
      setCourses(c);
      setAllNotes([...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }).catch(console.error);
  }, [user, today]);

  // ── Sound ─────────────────────────────────────────────────
  useEffect(() => {
    if (soundKey === "none") { stop(); return; }
    play(soundKey, muted ? 0 : volume);
  }, [soundKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setVol(muted ? 0 : volume); }, [volume, muted, setVol]);

  // ── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(intervalRef.current!);
    setRunning(false);
    setSecsLeft(customMins[modeKey] * 60);
  }, [modeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current!); return; }
    intervalRef.current = setInterval(() => {
      setSecsLeft(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          if (modeKey === "focus") {
            const mins = customMins.focus;
            setSessions(n => n + 1);
            setSessionLog(prev => [...prev, {
              mins,
              at: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            }]);
            setShowReflection(true);
            if (Notification.permission === "granted")
              new Notification("Focus session complete", { body: "Great work — take a break.", icon: "/favicon.ico" });
            toast.success("Session complete. Take a break.", { style: { background: "#1e293b", color: "#e2e8f0" } });
            if (autoBreak) {
              setTimeout(() => { setModeKey("short"); setSecsLeft(customMins["short"] * 60); setRunning(true); }, 1500);
            }
          } else {
            toast("Break over — time to focus.", { style: { background: "#1e293b", color: "#e2e8f0" } });
            setModeKey("focus");
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [running, modeKey, autoBreak, customMins]);

  const toggleTimer = useCallback(() => {
    if (secsLeft === 0) { setSecsLeft(customMins[modeKey] * 60); return; }
    if (!running && Notification.permission === "default") Notification.requestPermission();
    setRunning(r => !r);
  }, [secsLeft, running, customMins, modeKey]);

  const resetTimer = useCallback(() => {
    clearInterval(intervalRef.current!);
    setRunning(false);
    setSecsLeft(customMins[modeKey] * 60);
  }, [customMins, modeKey]);

  // ── Fullscreen ────────────────────────────────────────────
  const toggleImmersive = useCallback(() => {
    if (!isImmersive) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsImmersive(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsImmersive(false);
    }
  }, [isImmersive]);

  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setIsImmersive(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") { e.preventDefault(); toggleTimer(); }
      if (e.key.toLowerCase() === "f") toggleImmersive();
      if (e.key.toLowerCase() === "r") resetTimer();
      if (e.key === "Escape" && isImmersive) { document.exitFullscreen?.().catch(() => {}); setIsImmersive(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTimer, toggleImmersive, resetTimer, isImmersive]);

  const commitEditMins = (mk: ModeKey) => {
    const n = parseInt(editingVal, 10);
    if (!isNaN(n) && n >= 1 && n <= 120) {
      setCustomMins(p => ({ ...p, [mk]: n }));
      if (mk === modeKey) setSecsLeft(n * 60);
    }
    setEditingMode(null); setEditingVal("");
  };

  // ── Note auto-save ────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (!noteBody && !noteTitle) return;
    setNoteSaved(false);
    clearTimeout(saveTimer.current!);
    saveTimer.current = setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        if (noteId) {
          await updateFocusNote(noteId, { title: noteTitle, content: noteBody, updatedAt: now });
          setAllNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: noteTitle, content: noteBody, updatedAt: now } : n));
        } else {
          const id = await saveFocusNote({ userId: user.uid, title: noteTitle, content: noteBody, date: today, createdAt: now, updatedAt: now });
          setNoteId(id);
          setAllNotes(prev => [{ id, userId: user.uid, title: noteTitle, content: noteBody, date: today, createdAt: now, updatedAt: now }, ...prev]);
        }
        setNoteSaved(true);
      } catch { setNoteSaved(false); }
    }, 800);
  }, [noteTitle, noteBody]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Task toggle ───────────────────────────────────────────
  const toggleTask = async (task: Task) => {
    const next = new Set(checkedIds);
    if (next.has(task.id)) { next.delete(task.id); await updateTask(task.id, { status: "pending" }).catch(() => {}); }
    else { next.add(task.id); await updateTask(task.id, { status: "completed" }).catch(() => {}); }
    setCheckedIds(next);
  };

  // ── Session log ───────────────────────────────────────────
  const logSession = async () => {
    if (!user) return;
    try {
      await createStudyLog({
        userId: user.uid, courseId: logCourse || (courses[0]?.id ?? ""),
        date: today, hours: parseFloat((customMins.focus / 60).toFixed(2)),
        note: reflection || "Pomodoro session", createdAt: new Date().toISOString(),
      });
      toast.success("Session logged!", { style: { background: "#1e293b", color: "#e2e8f0" } });
    } catch { toast.error("Failed to log"); }
    setShowReflection(false); setReflection("");
  };

  const totalFocusMins = sessionLog.reduce((s, r) => s + r.mins, 0);
  const phrase = getPhrase(modeKey, running, sessions);

  // ─── Shared drawer panel content (JSX variable, not component, to avoid remount on every render)
  const drawerContent = (
    <div className="flex flex-col h-full gap-4">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: "rgba(0,0,0,0.25)" }}>
        {([
          { key: "notes", icon: NotebookPen, label: "Notes"  },
          { key: "tasks", icon: ListTodo,    label: "Tasks"  },
          { key: "stats", icon: BarChart2,   label: "Stats"  },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setPanel(key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={panel === key
              ? { background: theme.card, color: theme.text }
              : { color: theme.muted }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Notes panel */}
      {panel === "notes" && (
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {notesView === "list" ? (
            <>
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: theme.text }}>Notes</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full"
                    style={{ background: `${theme.accent}22`, color: theme.accent }}>{allNotes.length}</span>
                </div>
                <button onClick={() => { setNoteId(null); setNoteTitle(""); setNoteBody(""); setNotesView("edit"); }}
                  className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: `${theme.accent}22`, color: theme.accent }}>
                  <Plus size={12} /> New
                </button>
              </div>
              {allNotes.length === 0 ? (
                <div className="text-center py-10 flex-1">
                  <NotebookPen size={22} className="mx-auto mb-2 opacity-25" style={{ color: theme.muted }} />
                  <p className="text-[13px]" style={{ color: theme.muted }}>No notes yet</p>
                  <p className="text-[11px] mt-1 opacity-60" style={{ color: theme.muted }}>
                    Capture thoughts without leaving the zone
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2 overflow-y-auto flex-1">
                  {allNotes.map(n => (
                    <li key={n.id}
                      className="rounded-xl p-3 cursor-pointer transition-all group"
                      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${theme.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0"
                          onClick={() => { setNoteId(n.id); setNoteTitle(n.title); setNoteBody(n.content); setNotesView("edit"); }}>
                          <p className="text-[13px] font-semibold truncate" style={{ color: theme.text }}>
                            {n.title || "Untitled"}
                          </p>
                          <p className="text-[11px] mt-0.5 line-clamp-2 opacity-60" style={{ color: theme.muted }}>
                            {n.content || "No content"}
                          </p>
                        </div>
                        <button onClick={async () => {
                          await deleteFocusNote(n.id);
                          setAllNotes(prev => prev.filter(x => x.id !== n.id));
                          if (noteId === n.id) { setNoteId(null); setNoteTitle(""); setNoteBody(""); }
                        }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg"
                          style={{ color: "#f87171" }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between shrink-0">
                <button onClick={() => setNotesView("list")}
                  className="flex items-center gap-1 text-[12px] font-medium hover:opacity-80"
                  style={{ color: theme.muted }}>
                  <ChevronLeft size={14} /> All Notes
                </button>
                <span className="text-[11px]" style={{ color: noteSaved ? theme.muted : theme.accent }}>
                  {noteSaved ? "✓ Saved" : "Saving…"}
                </span>
              </div>
              <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
                placeholder="Note title…"
                className="bg-transparent font-semibold text-[15px] outline-none placeholder:opacity-30 w-full shrink-0"
                style={{ color: theme.text }} />
              <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)}
                placeholder={"Write anything — ideas, questions, reminders…"}
                className="bg-transparent text-[13px] leading-relaxed resize-none outline-none placeholder:opacity-30 flex-1"
                style={{ color: theme.text }} />
            </>
          )}
        </div>
      )}

      {/* Tasks panel */}
      {panel === "tasks" && (
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[13px] font-semibold" style={{ color: theme.text }}>Tasks</span>
            <span className="ml-auto text-[11px]" style={{ color: theme.muted }}>
              {checkedIds.size}/{tasks.length} done
            </span>
          </div>
          {tasks.length === 0 ? (
            <div className="text-center py-10 flex-1">
              <CheckCheck size={22} className="mx-auto mb-2 opacity-25" style={{ color: theme.muted }} />
              <p className="text-[13px]" style={{ color: theme.muted }}>No pending tasks</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 overflow-y-auto flex-1">
              {[...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(task => {
                const done     = checkedIds.has(task.id);
                const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                const tmrStr   = tomorrow.toISOString().split("T")[0];
                const overdue  = !done && task.dueDate < today;
                const dueToday = !done && task.dueDate === today;
                const dueTmr   = !done && task.dueDate === tmrStr;
                const label    = overdue ? "Overdue" : dueToday ? "Today" : dueTmr ? "Tomorrow" : null;
                const urgColor = overdue ? "#f87171" : dueToday ? "#fb923c" : "#facc15";
                return (
                  <li key={task.id} onClick={() => toggleTask(task)}
                    className="flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: done ? `${theme.accent}12` : overdue ? "rgba(248,113,113,0.07)" : "transparent" }}>
                    <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                      style={{ borderColor: done ? theme.accent : theme.border, background: done ? theme.accent : "transparent" }}>
                      {done && <CheckCircle2 size={9} color="white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13px] font-medium truncate"
                          style={{ color: done ? theme.muted : theme.text, textDecoration: done ? "line-through" : "none" }}>
                          {task.title}
                        </p>
                        {label && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ color: urgColor, background: `${urgColor}22` }}>
                            <AlertTriangle size={9} /> {label}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: theme.muted }}>Due {task.dueDate}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Stats panel */}
      {panel === "stats" && (
        <div className="flex-1 flex flex-col gap-3">
          <span className="text-[13px] font-semibold shrink-0" style={{ color: theme.text }}>Today's Sessions</span>
          {sessionLog.length === 0 ? (
            <p className="text-[12px] opacity-50" style={{ color: theme.muted }}>No sessions yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sessionLog.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: theme.accent }} />
                    <span className="text-[12px]" style={{ color: theme.muted }}>Session {i + 1}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px]" style={{ color: theme.muted }}>{r.at}</span>
                    <span className="text-[13px] font-semibold" style={{ color: theme.text }}>{r.mins} min</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <span className="text-[12px]" style={{ color: theme.muted }}>Total</span>
                <span className="text-[13px] font-bold" style={{ color: theme.accent }}>{totalFocusMins} min</span>
              </div>
            </div>
          )}
          <div className="mt-2 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
            {[
              ["Goal",   goal || "Not set"],
              ["Sound",  SOUNDS.find(s => s.key === soundKey)?.label ?? "None"],
              ["Tasks",  `${checkedIds.size} done`],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between items-center py-1.5">
                <span className="text-[12px]" style={{ color: theme.muted }}>{l}</span>
                <span className="text-[12px] font-semibold" style={{ color: theme.text }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sound bar */}
      <div className="shrink-0 rounded-2xl p-3 flex flex-col gap-2"
        style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${theme.border}` }}>
        <div className="flex gap-1.5 flex-wrap">
          {SOUNDS.map(s => {
            const SIcon = s.icon;
            return (
              <button key={s.key} onClick={() => setSoundKey(s.key)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all"
                style={soundKey === s.key
                  ? { background: `${theme.accent}30`, color: theme.accent, border: `1px solid ${theme.accent}55` }
                  : { background: "rgba(255,255,255,0.05)", color: theme.muted, border: "1px solid transparent" }}>
                <SIcon size={11} /> {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMuted(m => !m)}>
            {muted ? <VolumeX size={14} style={{ color: theme.muted }} /> : <Volume2 size={14} style={{ color: theme.accent }} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            onChange={e => { setMuted(false); setVolume(parseFloat(e.target.value)); }}
            className="flex-1" style={{ accentColor: theme.accent }} />
        </div>
      </div>

      {/* MP3 player */}
      {(() => {
        const current = playlist[trackIdx] ?? null;
        const goTo = (idx: number) => {
          const audio = audioRef.current;
          const next = (idx + playlist.length) % playlist.length;
          setTrackIdx(next);
          if (audio) { audio.src = playlist[next]?.src ?? ""; audio.play().catch(() => {}); setMp3Playing(true); }
        };
        const commitPaste = () => {
          const lines = pasteText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
          const tracks: Track[] = lines.map(url => ({
            src: url,
            name: decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? url).replace(/\.[^.]+$/, ""),
          }));
          if (tracks.length === 0) return;
          setPlaylist(prev => [...prev, ...tracks]);
          setPasteText(""); setPasteMode(false);
        };
        return (
          <div className="shrink-0 rounded-2xl p-3 flex flex-col gap-2"
            style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${theme.border}` }}>

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Music size={12} style={{ color: current ? theme.accent : theme.muted }} />
                <span className="text-[12px] font-semibold truncate max-w-[130px]"
                  style={{ color: current ? theme.accent : theme.muted }}>
                  {current ? current.name : "Music"}
                </span>
                {mp3Playing && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full animate-pulse shrink-0"
                    style={{ background: `${theme.accent}22`, color: theme.accent }}>♪</span>
                )}
              </div>
              <button onClick={() => setShowMusic(m => !m)}
                className="text-[11px] px-2 py-1 rounded-lg transition-all shrink-0"
                style={{ background: "rgba(255,255,255,0.05)", color: theme.muted }}>
                {showMusic ? "Hide" : "Show"}
              </button>
            </div>

            {showMusic && (
              <div className="flex flex-col gap-2">

                {/* Controls */}
                {current && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => goTo(trackIdx - 1)}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-70"
                      style={{ background: "rgba(255,255,255,0.07)" }}>
                      <ChevronLeft size={13} style={{ color: theme.muted }} />
                    </button>
                    <button
                      onClick={() => {
                        const audio = audioRef.current;
                        if (!audio) return;
                        if (mp3Playing) { audio.pause(); setMp3Playing(false); }
                        else { audio.play().catch(() => {}); setMp3Playing(true); }
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110"
                      style={{ background: `linear-gradient(135deg,${theme.accent},${theme.timerColor})` }}>
                      {mp3Playing
                        ? <Pause size={14} fill="white" color="white" />
                        : <Play  size={14} fill="white" color="white" className="ml-0.5" />}
                    </button>
                    <button onClick={() => goTo(trackIdx + 1)}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-70"
                      style={{ background: "rgba(255,255,255,0.07)", transform: "scaleX(-1)" }}>
                      <ChevronLeft size={13} style={{ color: theme.muted }} />
                    </button>
                    <span className="text-[11px] truncate flex-1" style={{ color: theme.muted }}>
                      {current.name}
                    </span>
                    <span className="text-[10px] shrink-0" style={{ color: theme.muted }}>
                      {trackIdx + 1}/{playlist.length}
                    </span>
                  </div>
                )}

                <audio
                  ref={audioRef}
                  src={current?.src ?? ""}
                  onPlay={() => setMp3Playing(true)}
                  onPause={() => setMp3Playing(false)}
                  onEnded={() => goTo(trackIdx + 1)}
                />

                {/* Playlist */}
                {playlist.length > 0 && (
                  <ul className="flex flex-col gap-1 max-h-[110px] overflow-y-auto">
                    {playlist.map((t, i) => (
                      <li key={i}
                        onClick={() => goTo(i)}
                        className="flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer transition-all text-[11px]"
                        style={{
                          background: i === trackIdx ? `${theme.accent}18` : "transparent",
                          color: i === trackIdx ? theme.accent : theme.muted,
                        }}>
                        <span className="w-3 shrink-0 text-center">
                          {i === trackIdx && mp3Playing ? "♪" : i + 1}
                        </span>
                        <span className="truncate flex-1">{t.name}</span>
                        <button onClick={e => {
                          e.stopPropagation();
                          const next = playlist.filter((_, j) => j !== i);
                          setPlaylist(next);
                          if (i === trackIdx && next.length > 0) goTo(Math.min(i, next.length - 1));
                          if (next.length === 0) { setMp3Playing(false); setTrackIdx(0); }
                        }}
                          className="opacity-0 hover:opacity-100 transition-opacity"
                          style={{ color: "#f87171" }}>
                          <X size={10} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Add tracks row */}
                {!pasteMode ? (
                  <button onClick={() => setPasteMode(true)}
                    className="w-full py-1.5 rounded-lg text-[11px] transition-all hover:opacity-80"
                    style={{ border: `1px dashed ${theme.border}`, color: theme.muted }}>
                    + Paste MP3 URLs
                  </button>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <textarea
                      autoFocus
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      placeholder={"Paste MP3 URLs, one per line…"}
                      rows={3}
                      className="w-full bg-transparent text-[11px] px-2.5 py-2 rounded-lg resize-none outline-none placeholder:opacity-30"
                      style={{ color: theme.text, border: `1px solid ${theme.border}` }}
                    />
                    <div className="flex gap-1.5">
                      <button onClick={commitPaste}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                        style={{ background: `${theme.accent}30`, color: theme.accent }}>
                        Add to playlist
                      </button>
                      <button onClick={() => { setPasteMode(false); setPasteText(""); }}
                        className="px-3 py-1.5 rounded-lg text-[11px] transition-all"
                        style={{ background: "rgba(255,255,255,0.05)", color: theme.muted }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* YouTube player */}
      {(() => {
        const toYtEmbed = (raw: string): string | null => {
          try {
            const url = new URL(raw.trim());
            if (!url.hostname.includes("youtube.com") && !url.hostname.includes("youtu.be")) return null;
            const vid  = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") ?? "";
            const list = url.searchParams.get("list");
            if (!vid && !list) return null;
            const p = new URLSearchParams({ autoplay: "1", rel: "0" });
            if (list) p.set("list", list);
            return vid
              ? `https://www.youtube.com/embed/${vid}?${p}`
              : `https://www.youtube.com/embed/videoseries?${p}`;
          } catch { return null; }
        };
        return (
          <div className="shrink-0 rounded-2xl p-3 flex flex-col gap-2"
            style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${theme.border}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Music2 size={12} style={{ color: ytEmbedSrc ? theme.accent : theme.muted }} />
                <span className="text-[12px] font-semibold" style={{ color: ytEmbedSrc ? theme.accent : theme.muted }}>
                  YouTube
                </span>
              </div>
              <button onClick={() => setShowYt(v => !v)}
                className="text-[11px] px-2 py-1 rounded-lg transition-all"
                style={{ background: "rgba(255,255,255,0.05)", color: theme.muted }}>
                {showYt ? "Hide" : "Show"}
              </button>
            </div>

            {/* Always in DOM so audio keeps playing when hidden */}
            <div className={showYt ? "flex flex-col gap-2" : "hidden"}>
              <div className="flex gap-1.5">
                <input
                  value={ytInput}
                  onChange={e => setYtInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== "Enter") return;
                    const src = toYtEmbed(ytInput);
                    if (src) setYtEmbedSrc(src);
                    else toast.error("Paste a valid YouTube URL");
                  }}
                  placeholder="Paste YouTube video or playlist URL…"
                  className="flex-1 bg-transparent text-[12px] px-2.5 py-1.5 rounded-lg outline-none placeholder:opacity-30"
                  style={{ color: theme.text, border: `1px solid ${theme.border}` }}
                />
                <button
                  onClick={() => {
                    const src = toYtEmbed(ytInput);
                    if (src) setYtEmbedSrc(src);
                    else toast.error("Paste a valid YouTube URL");
                  }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{ background: `${theme.accent}30`, color: theme.accent }}>
                  Load
                </button>
                {ytEmbedSrc && (
                  <button onClick={() => { setYtEmbedSrc(""); setYtInput(""); }}
                    className="px-2 py-1.5 rounded-lg transition-all"
                    style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                    <X size={12} />
                  </button>
                )}
              </div>
              {ytEmbedSrc && (
                <iframe
                  key={ytEmbedSrc}
                  src={ytEmbedSrc}
                  width="100%"
                  height={180}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  style={{ borderRadius: 10, border: "none", display: "block" }}
                />
              )}
            </div>

            {/* Keep iframe alive when player is hidden */}
            {!showYt && ytEmbedSrc && (
              <iframe
                key={"bg-" + ytEmbedSrc}
                src={ytEmbedSrc}
                width="1" height="1"
                allow="autoplay; encrypted-media"
                style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
              />
            )}
          </div>
        );
      })()}
    </div>
  );

  // ── Live clock ───────────────────────────────────────────
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
  useEffect(() => {
    const t = setInterval(() =>
      setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })), 10_000);
    return () => clearInterval(t);
  }, []);

  // ── Breathing phase (during breaks) ──────────────────────
  const [breatheIn, setBreatheIn] = useState(true);
  useEffect(() => {
    if (modeKey === "focus") return;
    const t = setInterval(() => setBreatheIn(b => !b), 4000);
    return () => clearInterval(t);
  }, [modeKey]);

  // ─────────────────────────────────────────────────────────
  // ── IMMERSIVE FULLSCREEN OVERLAY ─────────────────────────
  // ─────────────────────────────────────────────────────────
  if (isImmersive) {
    const isBreak = modeKey !== "focus";
    const uiOpacity = idle ? 0 : 1;

    return (
      <div className="fixed inset-0 z-[100] flex flex-col select-none overflow-hidden"
        style={{ background: theme.bg }}
        onMouseMove={resetIdle}>

        {/* Ambient radial glow — pulses when running */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{ opacity: running ? 1 : 0, transition: "opacity 1.2s ease" }}>
          <div style={{
            width: 600, height: 600, borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.accent}18 0%, ${theme.accent}06 50%, transparent 70%)`,
            animation: running ? "ping 3s cubic-bezier(0.3,0,0.7,1) infinite" : "none",
          }} />
        </div>
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{ opacity: running ? 0.6 : 0, transition: "opacity 1.2s ease" }}>
          <div style={{
            width: 420, height: 420, borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.accent}12 0%, transparent 70%)`,
          }} />
        </div>

        {/* Top bar — fades on idle */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-7 py-5 z-10 transition-opacity duration-700"
          style={{ opacity: uiOpacity }}>

          {/* Left: clock + date */}
          <div className="flex items-center gap-4">
            <span className="text-[22px] font-light tabular-nums" style={{ color: theme.text }}>
              {clock}
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] hidden sm:block" style={{ color: theme.muted }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </span>
          </div>

          {/* Right: themes + mute + exit */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {THEMES.map(t => (
                <button key={t.key} onClick={() => setThemeKey(t.key)}
                  title={t.label}
                  className="w-6 h-6 rounded-full transition-all hover:scale-110 flex items-center justify-center"
                  style={{
                    background: t.dot,
                    outline: themeKey === t.key ? `2px solid ${theme.text}` : `2px solid transparent`,
                    outlineOffset: "2px",
                    opacity: themeKey === t.key ? 1 : 0.45,
                  }} />
              ))}
            </div>
            <div className="w-px h-5 mx-1" style={{ background: theme.border }} />
            <button onClick={() => setMuted(m => !m)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${theme.border}` }}>
              {muted ? <VolumeX size={14} style={{ color: theme.muted }} /> : <Volume2 size={14} style={{ color: theme.accent }} />}
            </button>
            <button onClick={toggleImmersive}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${theme.border}` }}>
              <Minimize2 size={14} style={{ color: theme.muted }} />
            </button>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex-1 flex items-stretch px-6 pt-[72px] pb-5 gap-5 overflow-hidden">

          {/* ── Center: Timer column ────────────────────────── */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 min-w-0">

            {/* Goal hero */}
            <div className="transition-opacity duration-700 text-center" style={{ opacity: uiOpacity }}>
              {goal ? (
                <p className="text-[16px] font-medium leading-snug max-w-sm"
                  style={{ color: theme.text, opacity: 0.85 }}>
                  {goal}
                </p>
              ) : (
                <div className="flex items-center gap-2" style={{ opacity: 0.4 }}>
                  <Target size={12} style={{ color: theme.muted }} />
                  <input value={goal} onChange={e => setGoal(e.target.value)}
                    placeholder="Set a focus goal…"
                    className="bg-transparent text-sm outline-none placeholder:opacity-60 text-center"
                    style={{ color: theme.text, borderBottom: `1px solid ${theme.border}`, paddingBottom: "2px" }} />
                </div>
              )}
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1.5 transition-opacity duration-700" style={{ opacity: uiOpacity }}>
              {MODES.map(m => (
                <button key={m.key} onClick={() => setModeKey(m.key)}
                  className="px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200"
                  style={modeKey === m.key
                    ? { background: `${theme.accent}22`, color: theme.accent, border: `1px solid ${theme.accent}55` }
                    : { color: theme.muted, border: "1px solid transparent", opacity: 0.6 }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Ring + breathing overlay */}
            <div className="relative flex items-center justify-center shrink-0">
              {isBreak && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div style={{
                    width: breatheIn ? 180 : 120,
                    height: breatheIn ? 180 : 120,
                    borderRadius: "50%",
                    border: `1px solid ${theme.accent}44`,
                    background: `${theme.accent}08`,
                    transition: "width 4s ease-in-out, height 4s ease-in-out",
                  }} />
                </div>
              )}

              <Ring pct={(secsLeft / total) * 100} color={theme.timerColor}
                track={theme.trackColor} size={280} running={running} />

              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                <span className="text-[68px] font-bold leading-none tabular-nums"
                  style={{ color: theme.text, letterSpacing: "-2px" }}>
                  {fmt(secsLeft)}
                </span>
                <span className="text-[11px] tracking-[0.2em] uppercase" style={{ color: theme.muted, opacity: 0.45 }}>
                  {isBreak ? (breatheIn ? "breathe in" : "breathe out") : mode.label}
                </span>
              </div>
            </div>

            {/* Elapsed progress bar */}
            <div className="w-56 transition-opacity duration-700" style={{ opacity: uiOpacity }}>
              <div className="h-px rounded-full overflow-hidden" style={{ background: theme.trackColor }}>
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${(elapsed / total) * 100}%`, background: theme.timerColor, opacity: 0.5 }} />
              </div>
              <p className="text-[10px] text-center mt-1" style={{ color: theme.muted, opacity: 0.35 }}>
                {fmt(elapsed)} elapsed
              </p>
            </div>

            {/* Phrase */}
            <p className="text-[13px] font-light text-center max-w-[260px] leading-relaxed transition-opacity duration-700"
              style={{ color: theme.muted, opacity: idle ? 0 : 0.75 }}>
              {phrase}
            </p>

            {/* Session strip */}
            <div className="transition-opacity duration-700" style={{ opacity: uiOpacity }}>
              <SessionStrip records={sessionLog} goal={sessionGoal}
                accent={theme.accent} track={theme.trackColor} muted={theme.muted} />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-5 transition-opacity duration-700" style={{ opacity: uiOpacity }}>
              <button onClick={resetTimer}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${theme.border}` }}>
                <RotateCcw size={16} style={{ color: theme.muted }} />
              </button>

              <button onClick={toggleTimer}
                className="w-[76px] h-[76px] rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent}, ${theme.timerColor})`,
                  boxShadow: running ? `0 0 50px ${theme.accent}60, 0 0 20px ${theme.accent}40` : `0 0 20px ${theme.accent}30`,
                  transition: "box-shadow 0.8s ease, transform 0.15s ease",
                }}>
                {running
                  ? <Pause size={28} fill="white" color="white" />
                  : <Play  size={28} fill="white" color="white" className="ml-1" />}
              </button>

              <button onClick={() => setAutoBreak(b => !b)}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{
                  background: autoBreak ? `${theme.accent}20` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${autoBreak ? theme.accent + "66" : theme.border}`,
                }}>
                <SkipForward size={16} style={{ color: autoBreak ? theme.accent : theme.muted }} />
              </button>
            </div>
          </div>

          {/* ── Right: Glass panel ──────────────────────────── */}
          <div className="w-[300px] shrink-0 flex flex-col overflow-hidden transition-opacity duration-700"
            style={{
              opacity: uiOpacity,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${theme.border}`,
              borderRadius: "18px",
              backdropFilter: "blur(20px)",
              padding: "14px",
            }}>
            {drawerContent}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // ── NORMAL VIEW — distraction-free ───────────────────────
  // ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout noPadding>
      <div className="min-h-screen flex flex-col transition-opacity duration-1000"
        style={{ background: theme.bg, opacity: idle && !drawerOpen ? 0.35 : 1 }}
        onMouseMove={resetIdle}>

        {/* ── Top bar (fades with idle) ─────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 transition-opacity duration-500"
          style={{ opacity: idle && !drawerOpen ? 0 : 1 }}>

          <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: theme.muted }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>

          <div className="flex items-center gap-2">
            {/* Sound pill */}
            {soundKey !== "none" && (
              <button onClick={() => setSoundKey("none")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                style={{ background: `${theme.accent}20`, color: theme.accent, border: `1px solid ${theme.accent}40` }}>
                <Volume2 size={12} />
                {SOUNDS.find(s => s.key === soundKey)?.label}
                <X size={11} />
              </button>
            )}

            {/* Theme picker */}
            <div className="flex gap-1">
              {THEMES.map(t => (
                <button key={t.key} onClick={() => setThemeKey(t.key)}
                  title={t.label}
                  className="w-5 h-5 rounded-full transition-all hover:scale-110"
                  style={{
                    background: t.dot,
                    outline: themeKey === t.key ? `2px solid ${theme.text}` : `2px solid transparent`,
                    outlineOffset: "2px",
                    opacity: themeKey === t.key ? 1 : 0.4,
                  }} />
              ))}
            </div>

            {/* Fullscreen */}
            <button onClick={toggleImmersive}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${theme.border}` }}>
              <Maximize2 size={13} style={{ color: theme.muted }} />
            </button>
          </div>
        </div>

        {/* ── Center: Timer ────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">

          {/* Goal hero */}
          {editingGoal || !goal ? (
            <div className="flex items-center gap-2">
              <Target size={14} style={{ color: theme.muted }} />
              <input
                autoFocus={editingGoal}
                value={goal}
                onChange={e => setGoal(e.target.value)}
                onBlur={() => setEditingGoal(false)}
                onKeyDown={e => { if (e.key === "Enter") setEditingGoal(false); }}
                placeholder="What are you focusing on today?"
                className="bg-transparent text-sm outline-none placeholder:opacity-30 text-center min-w-[240px]"
                style={{ color: theme.text, borderBottom: `1px solid ${theme.border}`, paddingBottom: "2px" }}
              />
            </div>
          ) : (
            <button onClick={() => setEditingGoal(true)}
              className="flex items-center gap-2 group transition-opacity hover:opacity-80">
              <p className="text-[17px] font-semibold text-center leading-snug"
                style={{ color: theme.text }}>
                {goal}
              </p>
              <Pencil size={12} className="opacity-0 group-hover:opacity-40 transition-opacity"
                style={{ color: theme.muted }} />
            </button>
          )}

          {/* Mode tabs */}
          <div className="flex gap-1.5">
            {MODES.map(m => {
              const isActive  = modeKey === m.key;
              const isEditing = editingMode === m.key;
              return (
                <button key={m.key} onClick={() => !isEditing && setModeKey(m.key)}
                  className="flex flex-col items-center gap-1 px-5 py-2 rounded-2xl text-[13px] font-semibold transition-all"
                  style={isActive
                    ? { background: `${theme.accent}20`, color: theme.accent, border: `1px solid ${theme.accent}40` }
                    : { color: theme.muted, border: "1px solid transparent" }}>
                  <span>{m.label}</span>
                  {isEditing ? (
                    <input autoFocus value={editingVal}
                      onChange={e => setEditingVal(e.target.value)}
                      onBlur={() => commitEditMins(m.key)}
                      onKeyDown={e => { if (e.key === "Enter") commitEditMins(m.key); if (e.key === "Escape") { setEditingMode(null); setEditingVal(""); } }}
                      onClick={e => e.stopPropagation()}
                      className="w-10 text-center rounded bg-transparent outline-none border-b text-[11px]"
                      style={{ borderColor: theme.accent, color: theme.accent }} />
                  ) : (
                    <span className="text-[11px] opacity-40 cursor-text hover:opacity-70 transition-opacity"
                      onClick={e => { e.stopPropagation(); setEditingMode(m.key); setEditingVal(String(customMins[m.key])); }}>
                      {customMins[m.key]}m <Pencil size={8} className="inline" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Ring */}
          <div className="relative flex items-center justify-center">
            <Ring pct={(secsLeft / total) * 100} color={theme.timerColor}
              track={theme.trackColor} size={260} running={running} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <span className="text-[64px] font-bold leading-none tabular-nums"
                style={{ color: theme.text, letterSpacing: "-1.5px" }}>
                {fmt(secsLeft)}
              </span>
              <span className="text-[11px] uppercase tracking-widest opacity-40" style={{ color: theme.muted }}>
                {mode.label}
                {elapsed > 0 && ` · ${fmt(elapsed)} elapsed`}
              </span>
            </div>
          </div>

          {/* Phrase */}
          <p className="text-[13px] text-center leading-relaxed max-w-xs" style={{ color: theme.muted }}>
            {phrase}
          </p>

          {/* Session timeline strip */}
          <SessionStrip records={sessionLog} goal={sessionGoal}
            accent={theme.accent} track={theme.trackColor} muted={theme.muted} />
          <button onClick={() => setSessionGoal(g => g < 8 ? g + 1 : 2)}
            className="text-[10px] -mt-2 opacity-30 hover:opacity-60 transition-opacity"
            style={{ color: theme.muted }}>
            change goal ↺
          </button>

          {/* Controls */}
          <div className="flex items-center gap-5 mt-2">
            <button onClick={resetTimer}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.border}` }}>
              <RotateCcw size={17} style={{ color: theme.muted }} />
            </button>

            <button onClick={toggleTimer}
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-105 active:scale-95"
              style={{ background: `linear-gradient(135deg,${theme.accent},${theme.timerColor})`,
                boxShadow: running ? `0 0 30px ${theme.accent}55` : undefined }}>
              {running
                ? <Pause size={28} fill="white" color="white" />
                : <Play  size={28} fill="white" color="white" className="ml-1" />}
            </button>

            <button onClick={() => setAutoBreak(b => !b)}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-105"
              style={{ background: autoBreak ? `${theme.accent}22` : "rgba(255,255,255,0.05)",
                border: `1px solid ${autoBreak ? theme.accent : theme.border}` }}>
              <SkipForward size={17} style={{ color: autoBreak ? theme.accent : theme.muted }} />
            </button>
          </div>

          {/* Tiny status */}
          <p className="text-[11px] opacity-40" style={{ color: theme.muted }}>
            {autoBreak ? "auto-break on" : "manual mode"}
          </p>
        </div>

        {/* ── Floating drawer toggle ────────────────────────── */}
        <div className="flex justify-center pb-4 transition-opacity duration-500"
          style={{ opacity: idle && !drawerOpen ? 0 : 1 }}>
          <button
            onClick={() => setDrawerOpen(d => !d)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium transition-all hover:scale-105"
            style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${theme.border}`, color: theme.muted }}>
            <PanelBottomOpen size={14} />
            {drawerOpen ? "Close" : "Notes, Tasks & Sounds"}
          </button>
        </div>

        {/* ── Slide-up drawer ───────────────────────────────── */}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: drawerOpen ? "480px" : "0px" }}>
          <div className="border-t mx-4 mb-4 pt-4" style={{ borderColor: theme.border }}>
            <div style={{ height: "430px" }}>
              {drawerContent}
            </div>
          </div>
        </div>

      </div>

      {/* ── Reflection modal ─────────────────────────────────── */}
      {showReflection && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-sm shadow-2xl p-6"
            style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(99,102,241,0.15)" }}>
                <CheckCircle2 size={24} style={{ color: "#818cf8" }} />
              </div>
              <p className="text-white font-bold text-lg">Session complete</p>
              <p className="text-slate-400 text-sm mt-1">What did you accomplish?</p>
            </div>
            <textarea
              value={reflection} onChange={e => setReflection(e.target.value)}
              placeholder="e.g. Finished chapter 3, solved 5 problems…"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-none outline-none focus:border-indigo-500 placeholder:text-slate-600 mb-3"
            />
            {courses.length > 0 && (
              <select value={logCourse} onChange={e => setLogCourse(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white mb-3 outline-none">
                <option value="">Log to course (optional)</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            )}
            <div className="flex gap-2">
              <button onClick={logSession}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #6366f1, #818cf8)" }}>
                Log to Study Log
              </button>
              <button onClick={() => { setShowReflection(false); setReflection(""); }}
                className="px-4 py-2.5 rounded-xl text-slate-400 text-sm hover:bg-white/5 transition-colors">
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
