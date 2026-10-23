"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getUserTasks, createTask, updateTask, deleteTask, getUserCourses } from "@/lib/firestore";
import { Task, TaskPriority, Course } from "@/types";
import {
  Plus, X, Trash2, CheckCircle2, Circle, Clock,
  AlertCircle, Pencil, Flag,
} from "lucide-react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

// ─── Config ───────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:       { label: "Pending",     bg: "bg-gray-100",  text: "text-gray-600",  dot: "bg-gray-400"  },
  "in-progress": { label: "In Progress", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-400" },
  completed:     { label: "Completed",   bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
} as const;

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; flag: string }> = {
  high:   { label: "High",   color: "text-red-600",    bg: "bg-red-50",    flag: "text-red-500"    },
  medium: { label: "Medium", color: "text-amber-600",  bg: "bg-amber-50",  flag: "text-amber-400"  },
  low:    { label: "Low",    color: "text-slate-500",  bg: "bg-slate-50",  flag: "text-slate-400"  },
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

// ─── Form type ────────────────────────────────────────────────
type TaskForm = {
  title: string; description: string; dueDate: string; dueTime: string;
  courseId: string; status: Task["status"]; priority: TaskPriority;
};

const BLANK_FORM: TaskForm = {
  title: "", description: "", dueDate: "", dueTime: "", courseId: "",
  status: "pending", priority: "medium",
};

// ─── Task modal (create + edit) ───────────────────────────────
function TaskModal({
  initial, courses, onClose, onSave,
}: {
  initial?: Task;
  courses: Course[];
  onClose: () => void;
  onSave: (form: TaskForm) => Promise<void>;
}) {
  const [form, setForm] = useState<TaskForm>(
    initial
      ? {
          title: initial.title, description: initial.description ?? "",
          dueDate: initial.dueDate, dueTime: initial.dueTime ?? "",
          courseId: initial.courseId ?? "",
          status: initial.status, priority: initial.priority ?? "medium",
        }
      : BLANK_FORM
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.dueDate)      return toast.error("Due date is required");
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  const isEdit = !!initial;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="paper-card p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 leading-none">{isEdit ? "Edit Task" : "Add New Task"}</h2>
            <p className="text-sm text-slate-500 mt-1">{isEdit ? "Update task details" : "What do you need to get done?"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#f5f2ec] transition-colors border border-[#e8e4da]">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input label="Task Title *" placeholder="e.g. Complete assignment 1" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />

          <Input label="Description" placeholder="Optional details…" value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Due Date *" type="date" value={form.dueDate}
              onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            <Input label="Due Time" type="time" value={form.dueTime}
              onChange={e => setForm(p => ({ ...p, dueTime: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Course</label>
            <select value={form.courseId} onChange={e => setForm(p => ({ ...p, courseId: e.target.value }))}
              className="paper-input px-3 py-2.5 text-sm outline-none text-slate-700">
              <option value="">No course</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </div>

          {/* Priority */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Priority</label>
            <div className="flex gap-2">
              {(["high", "medium", "low"] as TaskPriority[]).map(p => {
                const cfg = PRIORITY_CONFIG[p];
                const active = form.priority === p;
                return (
                  <button key={p} type="button"
                    onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      active ? `${cfg.bg} border-current ${cfg.color}` : "border-[#e8e4da] text-slate-400 hover:border-[#d9d3c8]"
                    }`}>
                    <Flag size={13} className={active ? cfg.flag : ""} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status (only when editing) */}
          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</label>
              <div className="flex gap-2">
                {(["pending", "in-progress", "completed"] as Task["status"][]).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const active = form.status === s;
                  return (
                    <button key={s} type="button"
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                        active ? `${cfg.bg} ${cfg.text} border-current` : "border-[#e8e4da] text-slate-400 hover:border-[#d9d3c8]"
                      }`}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-1">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
            <Button type="submit" fullWidth loading={saving}>{isEdit ? "Save Changes" : "Create Task"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function TasksPage() {
  const { user } = useAuth();
  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [courses,      setCourses]      = useState<Course[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [editingTask,  setEditingTask]  = useState<Task | null>(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [filter,       setFilter]       = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [sortBy,       setSortBy]       = useState<"dueDate" | "priority">("dueDate");

  const load = async () => {
    if (!user) return;
    try {
      const [t, c] = await Promise.all([getUserTasks(user.uid), getUserCourses(user.uid)]);
      setTasks(t); setCourses(c);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);

  const handleCreate = async (form: TaskForm) => {
    await createTask({ ...form, userId: user!.uid, createdAt: new Date().toISOString() });
    toast.success("Task created!");
    setShowCreate(false);
    load();
  };

  const handleEdit = async (form: TaskForm) => {
    if (!editingTask) return;
    await updateTask(editingTask.id, form);
    toast.success("Task updated!");
    setEditingTask(null);
    load();
  };

  const handleStatusCycle = async (task: Task) => {
    const next =
      task.status === "pending"      ? "in-progress" :
      task.status === "in-progress"  ? "completed"   : "pending";
    try {
      await updateTask(task.id, { status: next });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      await deleteTask(id);
      toast.success("Task deleted!");
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch { toast.error("Failed to delete"); }
  };

  const isOverdue = (dueDate: string, status: string) =>
    status !== "completed" && new Date(dueDate) < new Date();

  const filtered = tasks
    .filter(t => {
      const statusOk   = filter === "all" || t.status === filter;
      const priorityOk = priorityFilter === "all" || t.priority === priorityFilter;
      const courseOk   = courseFilter === "all" || t.courseId === courseFilter;
      return statusOk && priorityOk && courseOk;
    })
    .sort((a, b) => {
      if (sortBy === "priority") {
        const pa = PRIORITY_ORDER[a.priority ?? "medium"];
        const pb = PRIORITY_ORDER[b.priority ?? "medium"];
        if (pa !== pb) return pa - pb;
      }
      return a.dueDate.localeCompare(b.dueDate);
    });

  const counts = {
    all:           tasks.length,
    pending:       tasks.filter(t => t.status === "pending").length,
    "in-progress": tasks.filter(t => t.status === "in-progress").length,
    completed:     tasks.filter(t => t.status === "completed").length,
  };

  return (
    <DashboardLayout>
      <div className="page-fade space-y-5">
        <div className="notebook-header flex items-center justify-between flex-wrap gap-3 px-5 py-4 md:px-6">
          <div>
            <h1 className="text-4xl md:text-5xl text-slate-800 leading-none mb-1">Tasks</h1>
            <p className="text-sm text-slate-500">
              {counts.pending} pending · {counts["in-progress"]} in progress · {counts.completed} completed
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Add Task
          </Button>
        </div>

        <div className="paper-card p-3 md:p-4">
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {(["all", "pending", "in-progress", "completed"] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  filter === s ? "bg-[#b98a2e] text-white shadow-sm" : "bg-[#f9f7f2] border border-[#e8e4da] text-slate-600 hover:bg-[#f3efe6]"
                }`}>
                {s === "all" ? "All" : STATUS_CONFIG[s].label}
                <span className={`ml-1.5 text-xs ${filter === s ? "text-[#f0d387]" : "text-slate-400"}`}>
                  {counts[s]}
                </span>
              </button>
            ))}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                className="paper-input px-3 py-1.5 rounded-xl text-sm text-slate-600">
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              {courses.length > 0 && (
                <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}
                  className="paper-input px-3 py-1.5 rounded-xl text-sm text-slate-600">
                  <option value="all">All Courses</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              )}

              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                className="paper-input px-3 py-1.5 rounded-xl text-sm text-slate-600">
                <option value="dueDate">Sort: Due Date</option>
                <option value="priority">Sort: Priority</option>
              </select>
            </div>
          </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-[#f5f2ec] border border-[#e8e4da] rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="paper-card flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 bg-[#f5f2ec] border border-[#e8e4da] rounded-2xl flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">No tasks found</p>
            <Button className="mt-5" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Add Task
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(task => {
              const overdue  = isOverdue(task.dueDate, task.status);
              const course   = courses.find(c => c.id === task.courseId);
              const scfg     = STATUS_CONFIG[task.status];
              const priority = task.priority ?? "medium";
              const pcfg     = PRIORITY_CONFIG[priority];
              return (
                <div key={task.id}
                  className={`paper-card flex items-start gap-4 px-4 py-3.5 transition-all group ${
                    overdue ? "border-red-200 bg-[#fff7f5]" : ""
                  }`}>
                  <button onClick={() => handleStatusCycle(task)} className="mt-0.5 shrink-0 transition-transform hover:scale-110">
                    {task.status === "completed" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : task.status === "in-progress" ? (
                      <Circle className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium text-sm leading-snug ${
                        task.status === "completed" ? "line-through text-slate-400" : "text-slate-800"
                      }`}>
                        {task.title}
                      </p>
                      <Flag size={11} className={`shrink-0 ${pcfg.flag}`} aria-label={`${pcfg.label} priority`} />
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? "text-red-500" : "text-slate-500"}`}>
                        {overdue ? <AlertCircle size={11} /> : <Clock size={11} />}
                        {overdue ? "Overdue · " : "Due "}{task.dueDate}
                        {task.dueTime && (
                          <span className="font-medium">· {(() => {
                            const [h, m] = task.dueTime.split(":").map(Number);
                            return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
                          })()}</span>
                        )}
                      </span>
                      {course && (
                        <span className="text-xs bg-[#eaf2ff] text-[#2459a7] px-2 py-0.5 rounded-full font-medium">
                          {course.code}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pcfg.bg} ${pcfg.color}`}>
                        {pcfg.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${scfg.bg} ${scfg.text}`}>
                      {scfg.label}
                    </span>
                    <button onClick={() => setEditingTask(task)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-[#b98a2e] transition-all p-1">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </div>

        {showCreate && (
          <TaskModal courses={courses} onClose={() => setShowCreate(false)} onSave={handleCreate} />
        )}
        {editingTask && (
          <TaskModal initial={editingTask} courses={courses} onClose={() => setEditingTask(null)} onSave={handleEdit} />
        )}
      </div>
    </DashboardLayout>
  );
}
