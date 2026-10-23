"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  getUserGrades, createGrade, updateGrade, deleteGrade, getUserCourses,
} from "@/lib/firestore";
import { Grade, Course, AssessmentType } from "@/types";
import {
  GraduationCap, Plus, X, Pencil, Trash2,
  Award, BookOpen, ChevronDown, ChevronUp,
  Calculator, Trash, Download, AlertTriangle, Trophy, TrendingDown,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Constants ───────────────────────────────────────────────
const ASSESSMENT_TYPES: AssessmentType[] = [
  "Quiz", "Assignment", "Midterm", "Final", "Project", "Lab",
];

const TYPE_STYLES: Record<AssessmentType, { bg: string; text: string; dot: string }> = {
  Quiz:       { bg: "#eff6ff", text: "#1d4ed8", dot: "#3b82f6" },
  Assignment: { bg: "#f5f3ff", text: "#6d28d9", dot: "#8b5cf6" },
  Midterm:    { bg: "#fffbeb", text: "#b45309", dot: "#f59e0b" },
  Final:      { bg: "#fef2f2", text: "#b91c1c", dot: "#ef4444" },
  Project:    { bg: "#f0fdf4", text: "#047857", dot: "#10b981" },
  Lab:        { bg: "#ecfeff", text: "#0e7490", dot: "#06b6d4" },
};

const INPUT_CLS = "w-full px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white";

const pct    = (s: number, t: number) => t > 0 ? (s / t) * 100 : 0;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function letterGrade(p: number) {
  if (p >= 90) return { letter: "A",  gpa: 4.0, color: "#16a34a", bg: "#f0fdf4" };
  if (p >= 80) return { letter: "B",  gpa: 3.0, color: "#2563eb", bg: "#eff6ff" };
  if (p >= 70) return { letter: "C",  gpa: 2.0, color: "#d97706", bg: "#fffbeb" };
  if (p >= 60) return { letter: "D",  gpa: 1.0, color: "#f97316", bg: "#fff7ed" };
  return               { letter: "F",  gpa: 0.0, color: "#dc2626", bg: "#fef2f2" };
}

function gradeBarColor(p: number) {
  if (p >= 80) return "#16a34a";
  if (p >= 70) return "#2563eb";
  if (p >= 60) return "#d97706";
  return "#dc2626";
}

const BLANK = {
  courseId: "", title: "", type: "Assignment" as AssessmentType,
  score: "", total: "100", date: new Date().toISOString().split("T")[0],
};

// ─── GPA Calculator ──────────────────────────────────────────
const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D+": 1.3, "D": 1.0, "D-": 0.7,
  "F":  0.0,
};
const GRADE_OPTIONS = Object.keys(GRADE_POINTS);
interface CalcRow { id: number; course: string; credits: string; grade: string; }

function GPACalculator() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CalcRow[]>([
    { id: 1, course: "", credits: "3", grade: "A" },
    { id: 2, course: "", credits: "3", grade: "B" },
  ]);

  const addRow    = () => setRows(r => [...r, { id: Date.now(), course: "", credits: "3", grade: "A" }]);
  const removeRow = (id: number) => setRows(r => r.filter(x => x.id !== id));
  const update    = (id: number, field: keyof CalcRow, val: string) =>
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));

  const valid        = rows.filter(r => !isNaN(parseFloat(r.credits)) && parseFloat(r.credits) > 0 && GRADE_POINTS[r.grade] !== undefined);
  const totalCredits = valid.reduce((s, r) => s + parseFloat(r.credits), 0);
  const gpa          = totalCredits > 0
    ? valid.reduce((s, r) => s + GRADE_POINTS[r.grade] * parseFloat(r.credits), 0) / totalCredits
    : null;

  const gpaColor = gpa === null ? "#94a3b8"
    : gpa >= 3.5 ? "#16a34a"
    : gpa >= 3.0 ? "#2563eb"
    : gpa >= 2.0 ? "#d97706"
    : "#dc2626";

  const gpaLabel = gpa === null ? "" : gpa >= 3.5 ? "Distinction" : gpa >= 3.0 ? "Merit" : gpa >= 2.0 ? "Pass" : "At Risk";

  return (
    <div className="bg-white rounded-2xl border border-[#e8e4da] mb-5 overflow-hidden card-lift">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#faf8f4] transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(201,168,76,0.12)" }}>
            <Calculator size={15} style={{ color: "#b98a2e" }} />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-semibold text-slate-800">GPA Calculator</p>
            <p className="text-[11px] text-slate-400">Estimate your semester GPA by credits</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {gpa !== null && open && (
            <span className="text-[18px] font-bold" style={{ color: gpaColor }}>{gpa.toFixed(2)}</span>
          )}
          {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#f5f2ec] px-5 py-5">

          {/* GPA result */}
          {gpa !== null && (
            <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between border"
              style={{ background: `${gpaColor}0d`, borderColor: `${gpaColor}33` }}>
              <div>
                <p className="text-[11px] text-slate-400 font-medium mb-0.5">Estimated GPA</p>
                <p className="text-[40px] font-bold leading-none" style={{ color: gpaColor }}>{gpa.toFixed(2)}</p>
                <p className="text-[11px] text-slate-400 mt-1">{totalCredits} credits · {gpaLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400 mb-1.5 font-semibold uppercase tracking-wider">Scale</p>
                {[
                  ["3.5–4.0", "Distinction", "#16a34a"],
                  ["3.0–3.4", "Merit",       "#2563eb"],
                  ["2.0–2.9", "Pass",         "#d97706"],
                  ["0.0–1.9", "At Risk",      "#dc2626"],
                ].map(([range, label, color]) => (
                  <p key={range} className="text-[11px] leading-relaxed" style={{ color }}>
                    {range} — {label}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Rows */}
          <div className="space-y-2 mb-3">
            <div className="grid grid-cols-[1fr_72px_100px_32px] gap-2 px-1 mb-1">
              {["Course", "Credits", "Grade", ""].map(h => (
                <p key={h} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
              ))}
            </div>
            {rows.map(row => (
              <div key={row.id} className="grid grid-cols-[1fr_72px_100px_32px] gap-2 items-center">
                <input value={row.course}
                  onChange={e => update(row.id, "course", e.target.value)}
                  placeholder="Course name"
                  className={INPUT_CLS} />
                <input type="number" min="1" max="6" step="0.5" value={row.credits}
                  onChange={e => update(row.id, "credits", e.target.value)}
                  className={`${INPUT_CLS} text-center`} />
                <select value={row.grade}
                  onChange={e => update(row.id, "grade", e.target.value)}
                  className={INPUT_CLS}>
                  {GRADE_OPTIONS.map(g => (
                    <option key={g} value={g}>{g} ({GRADE_POINTS[g].toFixed(1)})</option>
                  ))}
                </select>
                <button onClick={() => removeRow(row.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={addRow}
            className="flex items-center gap-1.5 text-[12px] font-semibold transition-colors hover:opacity-70"
            style={{ color: "#b98a2e" }}>
            <Plus size={13} /> Add course
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Course Section ───────────────────────────────────────────
function CourseSection({ course, grades, onAdd, onEdit, onDelete }: {
  course: Course; grades: Grade[];
  onAdd: (courseId: string) => void;
  onEdit: (g: Grade) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const avg = grades.length
    ? grades.reduce((s, g) => s + pct(g.score, g.total), 0) / grades.length
    : null;
  const lg = avg !== null ? letterGrade(avg) : null;

  return (
    <div className="bg-white rounded-2xl border border-[#e8e4da] overflow-hidden card-lift">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#faf8f4] transition-colors"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(201,168,76,0.12)" }}>
            <BookOpen size={14} style={{ color: "#b98a2e" }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-slate-800">{course.name}</p>
            <p className="text-[11px] text-slate-400">
              {course.code} · {grades.length} assessment{grades.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {avg !== null && lg && (
            <div className="text-right hidden sm:block">
              <p className="text-[20px] font-bold leading-none" style={{ color: lg.color }}>{lg.letter}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{fmtPct(avg)} · {lg.gpa.toFixed(1)} GPA</p>
            </div>
          )}
          <button onClick={e => { e.stopPropagation(); onAdd(course.id); }}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all active:scale-[0.97]"
            style={{ background: "rgba(201,168,76,0.12)", color: "#b98a2e" }}>
            <Plus size={11} /> Add
          </button>
          {open
            ? <ChevronUp size={14} className="text-slate-400" />
            : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </div>

      {/* Average bar */}
      {avg !== null && (
        <div className="px-5 pb-2">
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${avg}%`, background: gradeBarColor(avg) }} />
          </div>
        </div>
      )}

      {/* Grade table */}
      {open && (
        grades.length === 0 ? (
          <div className="px-5 py-6 text-center border-t border-[#f5f2ec]">
            <p className="text-[13px] text-slate-400">
              No grades yet —{" "}
              <button onClick={() => onAdd(course.id)}
                className="font-semibold hover:underline" style={{ color: "#b98a2e" }}>
                add one
              </button>
            </p>
          </div>
        ) : (
          <div className="border-t border-[#f5f2ec] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#faf8f4" }}>
                  {["Assessment", "Type", "Score", "Progress", "Grade", ""].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...grades].sort((a, b) => b.date.localeCompare(a.date)).map(g => {
                  const p  = pct(g.score, g.total);
                  const lg = letterGrade(p);
                  const ts = TYPE_STYLES[g.type];
                  return (
                    <tr key={g.id} className="border-t border-[#f8f5f0] hover:bg-[#faf8f4] transition-colors group">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-slate-800">{g.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{g.date}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                          style={{ background: ts.bg, color: ts.text }}>
                          {g.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-slate-700 whitespace-nowrap">
                        {g.score} / {g.total}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full transition-all"
                              style={{ width: `${p}%`, background: gradeBarColor(p) }} />
                          </div>
                          <span className="text-[12px] font-semibold text-slate-600 w-11 text-right shrink-0">
                            {fmtPct(p)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[15px] font-bold" style={{ color: lg.color }}>{lg.letter}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onEdit(g)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => onDelete(g.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─── Grade Modal ─────────────────────────────────────────────
function GradeModal({ courses, initial, onClose, onSave, saving }: {
  courses: Course[];
  initial: typeof BLANK & { id?: string };
  onClose: () => void;
  onSave:  (form: typeof BLANK) => Promise<void>;
  saving:  boolean;
}) {
  const [form, setForm] = useState(initial);
  const isEdit = !!initial.id;

  const scoreNum = parseFloat(form.score);
  const totalNum = parseFloat(form.total);
  const preview  = !isNaN(scoreNum) && !isNaN(totalNum) && totalNum > 0
    ? pct(scoreNum, totalNum) : null;
  const lg = preview !== null ? letterGrade(preview) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId) return toast.error("Select a course");
    if (!form.title)    return toast.error("Enter a title");
    const s = parseFloat(form.score);
    const t = parseFloat(form.total);
    if (isNaN(s) || isNaN(t) || t <= 0) return toast.error("Enter valid score and total");
    if (s > t) return toast.error("Score cannot exceed total");
    await onSave({ ...form, score: String(s), total: String(t) });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-6 py-5 border-b border-[#f5f2ec]">
          <div>
            <h2 className="text-[16px] font-bold text-slate-900">{isEdit ? "Edit Grade" : "Add Grade"}</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">Record an assessment result</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Course *</label>
            <select value={form.courseId}
              onChange={e => setForm(p => ({ ...p, courseId: e.target.value }))}
              className={INPUT_CLS}>
              <option value="">Select a course</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Title *</label>
              <input placeholder="e.g. Quiz 1" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Type *</label>
              <select value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value as AssessmentType }))}
                className={INPUT_CLS}>
                {ASSESSMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Score *</label>
              <input type="number" min="0" step="0.5" placeholder="85"
                value={form.score} onChange={e => setForm(p => ({ ...p, score: e.target.value }))}
                className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Out of *</label>
              <input type="number" min="1" step="0.5" placeholder="100"
                value={form.total} onChange={e => setForm(p => ({ ...p, total: e.target.value }))}
                className={INPUT_CLS} />
            </div>
          </div>

          {/* Live preview */}
          {preview !== null && lg && (
            <div className="rounded-xl px-4 py-3 flex items-center justify-between border"
              style={{ background: `${lg.color}0d`, borderColor: `${lg.color}33` }}>
              <div>
                <p className="text-[11px] text-slate-400">Preview</p>
                <p className="text-[28px] font-bold leading-none" style={{ color: lg.color }}>{lg.letter}</p>
              </div>
              <div className="text-right">
                <p className="text-[18px] font-bold" style={{ color: lg.color }}>{fmtPct(preview)}</p>
                <p className="text-[11px] text-slate-400">GPA {lg.gpa.toFixed(1)}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Date *</label>
            <input type="date" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className={INPUT_CLS} />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
              {saving
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : isEdit ? "Save Changes" : "Add Grade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────
export default function GradesPage() {
  const { user, profile } = useAuth();
  const [grades,    setGrades]    = useState<Grade[]>([]);
  const [courses,   setCourses]   = useState<Course[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<Grade | null>(null);
  const [prefillCourse, setPrefillCourse] = useState("");

  const load = async () => {
    if (!user) return;
    try {
      const [g, c] = await Promise.all([
        getUserGrades(user.uid),
        getUserCourses(user.uid, profile?.classId),
      ]);
      setGrades(g); setCourses(c);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);

  const openAdd  = (courseId = "") => { setEditing(null); setPrefillCourse(courseId); setShowModal(true); };
  const openEdit = (g: Grade)       => { setEditing(g); setPrefillCourse(g.courseId); setShowModal(true); };
  const close    = ()               => { setShowModal(false); setEditing(null); setPrefillCourse(""); };

  const handleSave = async (form: typeof BLANK) => {
    setSaving(true);
    try {
      const payload = {
        courseId: form.courseId, title: form.title, type: form.type,
        score: parseFloat(form.score), total: parseFloat(form.total), date: form.date,
      };
      if (editing) {
        await updateGrade(editing.id, payload);
        toast.success("Grade updated!");
      } else {
        await createGrade({ ...payload, userId: user!.uid, createdAt: new Date().toISOString() });
        toast.success("Grade added!");
      }
      close(); load();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this grade?")) return;
    try { await deleteGrade(id); toast.success("Deleted!"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const exportCSV = () => {
    const header = ["Date", "Course", "Title", "Type", "Score", "Total", "Percentage", "Letter"];
    const rows = grades.map(g => {
      const course = courses.find(c => c.id === g.courseId);
      const p = pct(g.score, g.total);
      return [g.date, course ? `${course.code} - ${course.name}` : g.courseId,
        g.title, g.type, g.score, g.total, p.toFixed(1) + "%", letterGrade(p).letter];
    });
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "grades.csv"; a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Stats ─────────────────────────────────────────────────
  const allPcts    = grades.map(g => pct(g.score, g.total));
  const overallAvg = allPcts.length ? allPcts.reduce((s, p) => s + p, 0) / allPcts.length : null;
  const overallLG  = overallAvg !== null ? letterGrade(overallAvg) : null;

  const courseAvgs = courses.map(c => {
    const cg  = grades.filter(g => g.courseId === c.id);
    const avg = cg.length ? cg.reduce((s, g) => s + pct(g.score, g.total), 0) / cg.length : null;
    return { course: c, avg };
  }).filter(x => x.avg !== null) as { course: Course; avg: number }[];

  const bestCourse  = courseAvgs.length ? courseAvgs.reduce((a, b) => a.avg >= b.avg ? a : b) : null;
  const worstCourse = courseAvgs.length ? courseAvgs.reduce((a, b) => a.avg <= b.avg ? a : b) : null;

  const needsAttention = grades
    .filter(g => pct(g.score, g.total) < 60)
    .sort((a, b) => pct(a.score, a.total) - pct(b.score, b.total));

  const typeChartData = ASSESSMENT_TYPES.map(type => {
    const tg  = grades.filter(g => g.type === type);
    const avg = tg.length ? tg.reduce((s, g) => s + pct(g.score, g.total), 0) / tg.length : null;
    return { type, avg: avg !== null ? parseFloat(avg.toFixed(1)) : null, count: tg.length };
  }).filter(d => d.avg !== null) as { type: string; avg: number; count: number }[];

  return (
    <DashboardLayout>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-slate-900 leading-tight">Grades</h1>
          <p className="text-[13px] text-slate-400 mt-1">
            {grades.length} assessment{grades.length !== 1 ? "s" : ""} across {courses.length} course{courses.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {grades.length > 0 && (
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-semibold border border-[#e8e4da] bg-white text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
              <Download size={14} /> Export CSV
            </button>
          )}
          <button onClick={() => openAdd()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
            <Plus size={15} /> Add Grade
          </button>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────── */}
      {overallAvg !== null && overallLG && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 stagger">

          {/* Overall */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e4da] card-lift col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <Award size={13} className="text-slate-400" />
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Overall</p>
            </div>
            <p className="text-[44px] font-bold leading-none mb-1" style={{ color: overallLG.color }}>
              {overallLG.letter}
            </p>
            <p className="text-[12px] text-slate-400">{fmtPct(overallAvg)} · {overallLG.gpa.toFixed(2)} / 4.00</p>
          </div>

          {/* Average */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e4da] card-lift">
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Avg Score</p>
            <p className="text-[26px] font-bold leading-none mb-1 text-slate-900">{fmtPct(overallAvg)}</p>
            <p className="text-[11px] text-slate-400">all assessments</p>
          </div>

          {/* Best course */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e4da] card-lift">
            <div className="flex items-center gap-1.5 mb-2">
              <Trophy size={12} className="text-green-500" />
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Best Course</p>
            </div>
            {bestCourse ? (
              <>
                <p className="text-[13px] font-bold truncate" style={{ color: "#16a34a" }}>{bestCourse.course.code}</p>
                <p className="text-[11px] text-slate-400 truncate">{bestCourse.course.name}</p>
                <p className="text-[22px] font-bold mt-1" style={{ color: "#16a34a" }}>{fmtPct(bestCourse.avg)}</p>
              </>
            ) : <p className="text-[22px] font-bold" style={{ color: "#16a34a" }}>—</p>}
          </div>

          {/* Needs work */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e4da] card-lift">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingDown size={12} className="text-red-400" />
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Needs Work</p>
            </div>
            {worstCourse ? (
              <>
                <p className="text-[13px] font-bold truncate" style={{ color: letterGrade(worstCourse.avg).color }}>
                  {worstCourse.course.code}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{worstCourse.course.name}</p>
                <p className="text-[22px] font-bold mt-1" style={{ color: letterGrade(worstCourse.avg).color }}>
                  {fmtPct(worstCourse.avg)}
                </p>
              </>
            ) : <p className="text-[22px] font-bold text-slate-300">—</p>}
          </div>
        </div>
      )}

      {/* ── Needs attention banner ─────────────────────────── */}
      {needsAttention.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={14} className="text-red-600" />
            </div>
            <p className="text-sm font-semibold text-red-800">
              {needsAttention.length} assessment{needsAttention.length !== 1 ? "s" : ""} below 60%
            </p>
          </div>
          <div className="space-y-2">
            {needsAttention.map(g => {
              const course = courses.find(c => c.id === g.courseId);
              const p = pct(g.score, g.total);
              return (
                <div key={g.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-red-100">
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">{g.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {course ? `${course.code} · ` : ""}{g.type} · {g.date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold text-red-600">{g.score} / {g.total}</p>
                    <p className="text-[11px] text-red-400">{fmtPct(p)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Type breakdown chart ───────────────────────────── */}
      {typeChartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-[#e8e4da] p-5 mb-5 card-lift">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(201,168,76,0.12)" }}>
              <Award size={13} style={{ color: "#b98a2e" }} />
            </div>
            <h3 className="text-[13px] font-semibold text-slate-800">Average by Assessment Type</h3>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={typeChartData} barSize={32} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f5f2ec" />
              <XAxis dataKey="type" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e8e4da", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                formatter={(v) => [`${v}%`, "Avg Score"]} />
              <Bar dataKey="avg" radius={[6, 6, 0, 0]}
                shape={(props: any) => (
                  <rect x={props.x} y={props.y} width={props.width} height={props.height}
                    rx={6} fill={gradeBarColor(props.avg)} />
                )} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-3 mt-3 flex-wrap">
            {typeChartData.map(d => {
              const ts = TYPE_STYLES[d.type as AssessmentType];
              return (
                <div key={d.type} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: ts.bg, color: ts.text }}>{d.type}</span>
                  <span className="text-[11px] text-slate-400">{d.count} · {d.avg}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GPA Calculator ─────────────────────────────────── */}
      <GPACalculator />

      {/* ── Per-course sections ────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-[#e8e4da] animate-pulse" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
            <GraduationCap size={28} className="text-white/70" />
          </div>
          <p className="font-semibold text-slate-600">No courses yet</p>
          <p className="text-sm text-slate-400 mt-1">Add courses in the Courses page, then track grades here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {courses.map(course => (
            <CourseSection
              key={course.id}
              course={course}
              grades={grades.filter(g => g.courseId === course.id)}
              onAdd={openAdd}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showModal && (
        <GradeModal
          courses={courses}
          initial={editing
            ? { id: editing.id, courseId: editing.courseId, title: editing.title,
                type: editing.type, score: String(editing.score), total: String(editing.total), date: editing.date }
            : { ...BLANK, courseId: prefillCourse }}
          onClose={close}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </DashboardLayout>
  );
}
