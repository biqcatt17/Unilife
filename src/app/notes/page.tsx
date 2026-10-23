"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  getFocusNotes, saveFocusNote, updateFocusNote,
  deleteFocusNote, getUserCourses,
} from "@/lib/firestore";
import { FocusNote, Course } from "@/types";
import {
  Plus, Trash2, Search, FileText, BookOpen, ChevronDown, Clock,
} from "lucide-react";
import toast from "react-hot-toast";

const TODAY = new Date().toISOString().split("T")[0];

const NOTE_COLORS = [
  { value: "default", dot: "bg-slate-300",  bar: "bg-slate-200",   card: "bg-white",       label: "Default" },
  { value: "blue",    dot: "bg-blue-400",   bar: "bg-blue-400",    card: "bg-blue-50",     label: "Blue"    },
  { value: "purple",  dot: "bg-purple-400", bar: "bg-purple-400",  card: "bg-purple-50",   label: "Purple"  },
  { value: "green",   dot: "bg-green-400",  bar: "bg-green-400",   card: "bg-green-50",    label: "Green"   },
  { value: "amber",   dot: "bg-amber-400",  bar: "bg-amber-400",   card: "bg-amber-50",    label: "Amber"   },
  { value: "rose",    dot: "bg-rose-400",   bar: "bg-rose-400",    card: "bg-rose-50",     label: "Rose"    },
];

const getColor = (val?: string) => NOTE_COLORS.find(c => c.value === val) ?? NOTE_COLORS[0];

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function relativeDate(iso: string) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7)  return `${diff}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupNotes(notes: Note[]) {
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups: { label: string; notes: Note[] }[] = [
    { label: "Today",     notes: [] },
    { label: "Yesterday", notes: [] },
    { label: "This Week", notes: [] },
    { label: "Earlier",   notes: [] },
  ];

  for (const n of notes) {
    const d    = new Date((n as any).updatedAt ?? n.date);
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (diff === 0)      groups[0].notes.push(n);
    else if (diff === 1) groups[1].notes.push(n);
    else if (diff < 7)  groups[2].notes.push(n);
    else                groups[3].notes.push(n);
  }

  return groups.filter(g => g.notes.length > 0);
}

type Note = FocusNote & { courseId?: string; color?: string };

export default function NotesPage() {
  const { user, profile } = useAuth();

  const [notes,        setNotes]        = useState<Note[]>([]);
  const [courses,      setCourses]      = useState<Course[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [filterCourse, setFilterCourse] = useState("all");

  const [selected,  setSelected]  = useState<Note | null>(null);
  const [title,     setTitle]     = useState("");
  const [content,   setContent]   = useState("");
  const [courseId,  setCourseId]  = useState("");
  const [date,      setDate]      = useState(TODAY);
  const [color,     setColor]     = useState("default");
  const [saving,    setSaving]    = useState(false);
  const [dirty,     setDirty]     = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const contentRef  = useRef<HTMLTextAreaElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<Note | null>(null);
  selectedRef.current = selected;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [n, c] = await Promise.all([
        getFocusNotes(user.uid),
        getUserCourses(user.uid, profile?.classId),
      ]);
      setNotes(n as Note[]);
      setCourses(c);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user, profile?.classId]);

  useEffect(() => { load(); }, [load]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = contentRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [content]);

  // Auto-save after 1.5s of inactivity
  const triggerAutoSave = useCallback((
    t: string, c: string, cId: string, d: string, col: string
  ) => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      if (!t.trim()) return;
      const now  = new Date().toISOString();
      const data = { title: t.trim(), content: c, courseId: cId, date: d, color: col };
      try {
        const cur = selectedRef.current;
        if (cur) {
          await updateFocusNote(cur.id, { ...data, updatedAt: now });
        } else {
          await saveFocusNote({ userId: user!.uid, ...data, createdAt: now, updatedAt: now } as any);
        }
        setDirty(false);
        setLastSaved(new Date());
        await load();
      } catch { /* silent auto-save fail */ }
    }, 1500);
  }, [user, load]);

  const openNote = (note: Note) => {
    setSelected(note);
    setTitle(note.title);
    setContent(note.content);
    setCourseId(note.courseId ?? "");
    setDate(note.date);
    setColor((note as any).color ?? "default");
    setDirty(false);
    setLastSaved(null);
    setIsEditing(true);
  };

  const newNote = () => {
    setSelected(null);
    setTitle("");
    setContent("");
    setCourseId("");
    setDate(TODAY);
    setColor("default");
    setDirty(false);
    setLastSaved(null);
    setIsEditing(true);
    setTimeout(() => document.getElementById("note-title")?.focus(), 50);
  };

  const handleSave = useCallback(async (
    t = title, c = content, cId = courseId, d = date, col = color
  ) => {
    if (!t.trim()) return toast.error("Title is required");
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    setSaving(true);
    const now  = new Date().toISOString();
    const data = { title: t.trim(), content: c, courseId: cId, date: d, color: col };
    try {
      if (selectedRef.current) {
        await updateFocusNote(selectedRef.current.id, { ...data, updatedAt: now });
        toast.success("Saved");
      } else {
        await saveFocusNote({ userId: user!.uid, ...data, createdAt: now, updatedAt: now } as any);
        toast.success("Note created");
      }
      setDirty(false);
      setLastSaved(new Date());
      await load();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  }, [title, content, courseId, date, color, user, load]);

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.title}"?`)) return;
    try {
      await deleteFocusNote(selected.id);
      toast.success("Deleted");
      setSelected(null); setTitle(""); setContent("");
      setIsEditing(false);
      await load();
    } catch { toast.error("Failed to delete"); }
  };

  // Cmd+S save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isEditing) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing, handleSave]);

  const filtered = notes
    .filter(n => {
      const q = search.toLowerCase();
      return (!q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
        && (filterCourse === "all" || n.courseId === filterCourse);
    })
    .sort((a, b) => ((b as any).updatedAt ?? b.date).localeCompare((a as any).updatedAt ?? a.date));

  const grouped   = groupNotes(filtered);
  const col       = getColor(color);
  const hasEditor = isEditing;

  return (
    <DashboardLayout noPadding>
      <div className="flex h-[calc(100vh-45px)] overflow-hidden" style={{ background: "#faf8f3" }}>

        {/* ── Sidebar ────────────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col border-r border-[#e8e4da]"
          style={{ background: "#f5f2ec" }}>

          {/* Header */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-slate-500" />
              <span className="font-bold text-slate-800 text-[14px]">Notes</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#e8e4da] text-slate-500 font-semibold leading-none">
                {notes.length}
              </span>
            </div>
            <button onClick={newNote}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-white text-[12px] font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
              <Plus size={13} /> New
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2 shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-[#e0dbd2] text-[12px] outline-none focus:border-[#b98a2e] focus:ring-1 focus:ring-[rgba(201,168,76,0.14)] placeholder-slate-400 transition-all" />
            </div>
          </div>

          {/* Course filter */}
          {courses.length > 0 && (
            <div className="px-3 pb-3 shrink-0">
              <div className="relative">
                <BookOpen size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
                  className="w-full pl-8 pr-6 py-2 rounded-xl bg-white border border-[#e0dbd2] text-[12px] outline-none focus:border-[#b98a2e] text-slate-600 appearance-none cursor-pointer">
                  <option value="all">All courses</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Note list */}
          <div className="flex-1 overflow-y-auto pb-4 sidebar-scroll">
            {loading ? (
              <div className="space-y-2 px-3">
                {[1,2,3,4].map(i => <div key={i} className="h-16 bg-[#ece8e1] rounded-xl animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#e8e4da] flex items-center justify-center">
                  <FileText size={20} className="text-slate-400" />
                </div>
                <p className="text-[12px] font-medium text-slate-500">
                  {search ? "No matching notes" : "No notes yet"}
                </p>
                {!search && (
                  <button onClick={newNote}
                    className="text-[12px] font-semibold hover:underline mt-1" style={{ color: "#b98a2e" }}>
                    Create your first note →
                  </button>
                )}
              </div>
            ) : (
              <div className="px-2">
                {grouped.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 pt-4 pb-1.5">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {group.notes.map(note => {
                        const nc       = getColor((note as any).color);
                        const course   = courses.find(c => c.id === note.courseId);
                        const isActive = selected?.id === note.id;
                        const preview  = note.content.replace(/\n+/g, " ").slice(0, 60);
                        return (
                          <li key={note.id}>
                            <button onClick={() => openNote(note)}
                              className={`w-full text-left rounded-xl transition-all duration-150 overflow-hidden ${
                                isActive ? "shadow-sm" : "hover:bg-[#ece8e1]"
                              }`}
                              style={isActive
                                ? { background: "linear-gradient(135deg, #b98a2e, #a6731d)" }
                                : {}}>
                              <div className="flex items-stretch">
                                {/* Color bar */}
                                <div className={`w-1 shrink-0 rounded-l-xl ${nc.bar} ${isActive ? "opacity-60" : ""}`} />
                                <div className="flex-1 px-3 py-2.5 min-w-0">
                                  <p className={`text-[13px] font-semibold truncate leading-tight ${isActive ? "text-white" : "text-slate-800"}`}>
                                    {note.title}
                                  </p>
                                  {preview && (
                                    <p className={`text-[11px] mt-0.5 truncate leading-snug ${isActive ? "text-white/50" : "text-slate-400"}`}>
                                      {preview}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    {course && (
                                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                        isActive ? "bg-white/15 text-white/70" : "bg-[#e8e4da] text-slate-500"
                                      }`}>
                                        {course.code}
                                      </span>
                                    )}
                                    <span className={`text-[10px] ml-auto shrink-0 ${isActive ? "text-white/40" : "text-slate-400"}`}>
                                      {relativeDate((note as any).updatedAt ?? note.date)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Editor ─────────────────────────────────────────────── */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-colors duration-300 ${hasEditor ? col.card : "bg-white"}`}>
          {!hasEditor ? (
            /* Empty / welcome state */
            <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-sm"
                style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                <FileText size={32} className="text-white/80" />
              </div>
              <div>
                <p className="font-bold text-slate-700 text-lg">Your notes live here</p>
                <p className="text-sm text-slate-400 mt-1 max-w-xs">
                  Select a note from the sidebar or start a new one. Notes auto-save as you type.
                </p>
              </div>
              <button onClick={newNote}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                <Plus size={15} /> New Note
              </button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-black/[0.06] bg-white/50 backdrop-blur-sm">

                {/* Color swatches */}
                <div className="flex items-center gap-1.5 pr-3 border-r border-black/[0.07]">
                  {NOTE_COLORS.map(c => (
                    <button key={c.value} type="button"
                      onClick={() => { setColor(c.value); setDirty(true); triggerAutoSave(title, content, courseId, date, c.value); }}
                      title={c.label}
                      className={`w-4.5 h-4.5 rounded-full border-2 transition-all ${c.dot} ${
                        color === c.value ? "border-slate-600 scale-125 shadow-sm" : "border-transparent hover:scale-110"
                      }`}
                      style={{ width: 18, height: 18 }} />
                  ))}
                </div>

                {/* Course selector */}
                <div className="relative">
                  <select value={courseId}
                    onChange={e => { setCourseId(e.target.value); setDirty(true); triggerAutoSave(title, content, e.target.value, date, color); }}
                    className="text-[12px] text-slate-500 bg-transparent border-none outline-none cursor-pointer pr-5 appearance-none font-medium">
                    <option value="">No course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                  <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                <span className="text-slate-200 text-sm">·</span>

                {/* Date */}
                <input type="date" value={date}
                  onChange={e => { setDate(e.target.value); setDirty(true); triggerAutoSave(title, content, courseId, e.target.value, color); }}
                  className="text-[12px] text-slate-500 bg-transparent border-none outline-none cursor-pointer font-medium" />

                {/* Right actions */}
                <div className="flex items-center gap-2 ml-auto">
                  {/* Auto-save status */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {saving ? (
                      <><span className="w-3 h-3 border border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                      <span className="text-slate-400">Saving…</span></>
                    ) : lastSaved ? (
                      <><Clock size={11} className="text-slate-300" />
                      <span className="text-slate-400">Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></>
                    ) : dirty ? (
                      <span className="text-amber-500 font-medium">Unsaved</span>
                    ) : null}
                  </div>

                  {selected && (
                    <button onClick={handleDelete}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}

                  <button onClick={() => handleSave()} disabled={saving}
                    className="px-3.5 py-1.5 rounded-xl text-white text-[12px] font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                    Save
                  </button>
                </div>
              </div>

              {/* Title */}
              <div className="px-10 pt-8 pb-1 shrink-0">
                <input
                  id="note-title"
                  value={title}
                  onChange={e => {
                    setTitle(e.target.value);
                    setDirty(true);
                    triggerAutoSave(e.target.value, content, courseId, date, color);
                  }}
                  placeholder="Untitled"
                  className="w-full text-[28px] font-bold text-slate-900 bg-transparent border-none outline-none placeholder-slate-300 leading-tight"
                />
                <div className="mt-2 h-px w-full" style={{ background: "rgba(0,0,0,0.05)" }} />
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-10 pt-4 pb-8">
                <textarea
                  ref={contentRef}
                  value={content}
                  onChange={e => {
                    setContent(e.target.value);
                    setDirty(true);
                    triggerAutoSave(title, e.target.value, courseId, date, color);
                  }}
                  placeholder="Start writing…"
                  className="w-full bg-transparent border-none outline-none text-[15px] text-slate-700 leading-[1.85] resize-none placeholder-slate-300 min-h-[300px]"
                  style={{ height: "auto" }}
                />
              </div>

              {/* Footer */}
              <div className="shrink-0 px-10 py-2.5 border-t border-black/[0.05] flex items-center gap-4">
                <p className="text-[11px] text-slate-400">
                  {wordCount(content)} word{wordCount(content) !== 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-slate-300">·</p>
                <p className="text-[11px] text-slate-400">
                  {content.length} character{content.length !== 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-slate-300 ml-auto">⌘S to save</p>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
