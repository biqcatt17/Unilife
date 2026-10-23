"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getUserExpenses, createExpense, deleteExpense } from "@/lib/firestore";
import { Expense, ExpenseCategory } from "@/types";
import {
  Wallet, Plus, X, Trash2, Receipt, DollarSign, Settings, Download,
  Utensils, Car, Home, BookOpen, Gamepad2, HeartPulse, Package,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie,
} from "recharts";

const EXCHANGE_RATE = 4100;

const CATEGORIES: { value: ExpenseCategory; icon: React.ElementType; label: string; color: string; iconBg: string; textColor: string }[] = [
  { value: "food",          icon: Utensils,   label: "Food",          color: "#3B82F6", iconBg: "#eff6ff", textColor: "#1d4ed8" },
  { value: "transport",     icon: Car,        label: "Transport",     color: "#8B5CF6", iconBg: "#f5f3ff", textColor: "#6d28d9" },
  { value: "housing",       icon: Home,       label: "Housing",       color: "#10B981", iconBg: "#f0fdf4", textColor: "#047857" },
  { value: "education",     icon: BookOpen,   label: "Education",     color: "#F59E0B", iconBg: "#fffbeb", textColor: "#b45309" },
  { value: "entertainment", icon: Gamepad2,   label: "Fun",           color: "#EF4444", iconBg: "#fef2f2", textColor: "#b91c1c" },
  { value: "health",        icon: HeartPulse, label: "Health",        color: "#06B6D4", iconBg: "#ecfeff", textColor: "#0e7490" },
  { value: "other",         icon: Package,    label: "Other",         color: "#6B7280", iconBg: "#f9fafb", textColor: "#4b5563" },
];

const getCat = (val: string) => CATEGORIES.find(c => c.value === val) || CATEGORIES[CATEGORIES.length - 1];

export default function FinancePage() {
  const { user, profile } = useAuth();
  const [expenses,    setExpenses]    = useState<Expense[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [showBudget,  setShowBudget]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [budget,      setBudget]      = useState(profile?.monthlyBudgetUSD || 0);
  const [monthFilter,    setMonthFilter]    = useState(new Date().toISOString().slice(0, 7));
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");
  const [rate,           setRate]           = useState(EXCHANGE_RATE);
  const [form, setForm] = useState({
    amountUSD: "", category: "food" as ExpenseCategory,
    note: "", expenseDate: new Date().toISOString().split("T")[0],
  });

  const load = async () => {
    if (!user) return;
    try { setExpenses(await getUserExpenses(user.uid)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => { setBudget(profile?.monthlyBudgetUSD || 0); }, [profile]);

  const monthly    = expenses
    .filter(e => e.expenseDate.startsWith(monthFilter))
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  const filtered   = categoryFilter === "all" ? monthly : monthly.filter(e => e.category === categoryFilter);
  const totalUSD   = monthly.reduce((s, e) => s + e.amountUSD, 0);
  const totalKHR   = Math.round(totalUSD * rate);
  const remaining  = budget - totalUSD;
  const budgetPct  = budget > 0 ? Math.min((totalUSD / budget) * 100, 100) : 0;

  const categoryData = CATEGORIES.map(cat => ({
    name: cat.label, value: monthly.filter(e => e.category === cat.value).reduce((s, e) => s + e.amountUSD, 0),
    color: cat.color, fill: cat.color,
  })).filter(d => d.value > 0);

  const dailyMap: Record<string, number> = {};
  monthly.forEach(e => { dailyMap[e.expenseDate] = (dailyMap[e.expenseDate] || 0) + e.amountUSD; });
  const dailyData = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ day: date.slice(8), amount: parseFloat(amount.toFixed(2)) }));

  const handleCreate = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const usd = parseFloat(form.amountUSD);
    if (!usd || usd <= 0) return toast.error("Please enter a valid amount");
    if (!form.expenseDate) return toast.error("Please select a date");
    setSaving(true);
    try {
      await createExpense({
        userId: user!.uid, amountUSD: usd, amountKHR: Math.round(usd * rate),
        exchangeRate: rate, category: form.category, note: form.note,
        expenseDate: form.expenseDate, createdAt: new Date().toISOString(),
      });
      toast.success("Expense added!");
      setShowModal(false);
      setForm({ amountUSD: "", category: "food", note: "", expenseDate: new Date().toISOString().split("T")[0] });
      load();
    } catch { toast.error("Failed to add expense"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try { await deleteExpense(id); toast.success("Deleted!"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const exportCSV = () => {
    const header = ["Date", "Category", "Amount (USD)", "Amount (KHR)", "Note"];
    const rows = expenses.map(e => {
      const cat = getCat(e.category);
      return [e.expenseDate, cat.label, e.amountUSD.toFixed(2), e.amountKHR, e.note || ""];
    });
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "expenses.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleSaveBudget = async () => {
    try {
      const { updateUserProfile } = await import("@/lib/firestore");
      await updateUserProfile(user!.uid, { monthlyBudgetUSD: budget });
      toast.success("Budget saved!");
      setShowBudget(false);
    } catch { toast.error("Failed to save budget"); }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-slate-900 leading-tight">Finance Tracker</h1>
          <p className="text-[13px] text-slate-400 mt-1">Track your expenses in USD & KHR</p>
        </div>
        <div className="flex gap-2">
          {expenses.length > 0 && (
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-semibold border border-[#e8e4da] bg-white text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
              <Download size={14} /> Export CSV
            </button>
          )}
          <button onClick={() => setShowBudget(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-semibold border border-[#e8e4da] bg-white text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
            <Settings size={14} /> Budget
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
            <Plus size={15} /> Add Expense
          </button>
        </div>
      </div>

      {/* Month + Rate pickers */}
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Month</label>
          <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Exchange Rate (1 USD = ? KHR)</label>
          <input type="number" value={rate} onChange={e => setRate(Number(e.target.value))}
            className="px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] w-36 bg-white" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger">
        {[
          { icon: DollarSign, label: "Spent (USD)",  value: `$${totalUSD.toFixed(2)}`,                                          color: "#2563eb", bg: "#eff6ff" },
          { icon: Wallet,     label: "Spent (KHR)",  value: `៛${totalKHR.toLocaleString()}`,                                   color: "#6d28d9", bg: "#f5f3ff" },
          { icon: Wallet,     label: "Remaining",    value: budget > 0 ? `$${remaining.toFixed(2)}` : "No budget",              color: remaining < 0 ? "#dc2626" : "#16a34a", bg: remaining < 0 ? "#fef2f2" : "#f0fdf4" },
          { icon: Receipt,    label: "Transactions", value: monthly.length,                                                      color: "#d97706", bg: "#fffbeb" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-[#e8e4da] card-lift">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: bg }}>
              <Icon size={15} style={{ color }} />
            </div>
            <p className="text-[26px] font-bold leading-none mb-1" style={{ color }}>{loading ? "—" : value}</p>
            <p className="text-[12px] text-slate-400 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Budget Progress */}
      {budget > 0 && (
        <div className="bg-white rounded-2xl px-5 py-4 border border-[#e8e4da] mb-5 card-lift">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[13px] font-semibold text-slate-700">Monthly Budget: ${budget}</p>
            <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${
              budgetPct >= 90 ? "bg-red-50 text-red-600" : budgetPct >= 70 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
            }`}>
              {budgetPct.toFixed(0)}% used
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="h-2 rounded-full transition-all duration-700"
              style={{
                width: `${budgetPct}%`,
                background: budgetPct >= 90 ? "#dc2626" : budgetPct >= 70 ? "#d97706" : "#16a34a",
              }} />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-[11px] text-slate-400">${remaining.toFixed(2)} remaining</p>
            {budgetPct >= 90 && (
              <div className="flex items-center gap-1">
                <AlertTriangle size={11} className="text-red-500" />
                <p className="text-[11px] text-red-500 font-medium">Approaching limit</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      {monthly.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <div className="bg-white rounded-2xl p-5 border border-[#e8e4da] card-lift">
            <h2 className="text-[13px] font-semibold text-slate-800 mb-4">Daily Spending (USD)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [`$${v}`, "Amount"]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }} />
                <Bar dataKey="amount" fill="#3B82F6" radius={[6,6,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#e8e4da] card-lift">
            <h2 className="text-[13px] font-semibold text-slate-800 mb-4">By Category</h2>
            <div className="flex gap-4 items-center">
              <div className="shrink-0" style={{ width: 140, height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value" />
                    <Tooltip formatter={(v: any) => [`$${v.toFixed(2)}`, "Amount"]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5 min-w-0">
                {categoryData.map(cat => (
                  <li key={cat.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                    <span className="text-xs text-gray-600 flex-1 truncate">{cat.name}</span>
                    <span className="text-xs font-semibold text-gray-800">${cat.value.toFixed(2)}</span>
                    <span className="text-[11px] text-gray-400 w-9 text-right">{totalUSD > 0 ? Math.round((cat.value / totalUSD) * 100) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Expense List */}
      <div className="bg-white rounded-2xl border border-[#e8e4da] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#f5f2ec]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-800">
              {new Date(monthFilter + "-01").toLocaleString("default", { month: "long", year: "numeric" })}
            </h2>
            <span className="text-[12px] text-slate-400">{filtered.length} of {monthly.length} transactions</span>
          </div>
          {/* Category filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setCategoryFilter("all")}
              className="text-xs px-3 py-1 rounded-full font-medium border transition-all"
              style={categoryFilter === "all"
                ? { background: "linear-gradient(135deg, #b98a2e, #8b5e1b)", color: "#fff", borderColor: "transparent" }
                : { borderColor: "#e8e4da", color: "#64748b" }}>
              All
            </button>
            {CATEGORIES.filter(c => monthly.some(e => e.category === c.value)).map(cat => {
              const CatIcon = cat.icon;
              return (
                <button key={cat.value}
                  onClick={() => setCategoryFilter(categoryFilter === cat.value ? "all" : cat.value)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium border transition-all"
                  style={categoryFilter === cat.value
                    ? { background: "linear-gradient(135deg, #b98a2e, #a6731d)", color: "#fff", borderColor: "transparent" }
                    : { borderColor: "#e8e4da", color: "#64748b" }}>
                  <CatIcon size={11} /> {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="p-5 space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-[#f5f2ec] rounded-xl animate-pulse" />)}</div>
        ) : monthly.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
              <Wallet size={24} className="text-white/70" />
            </div>
            <p className="text-slate-500 font-semibold text-sm">No expenses this month</p>
            <p className="text-slate-400 text-xs mt-1">Start tracking your spending</p>
            <button onClick={() => setShowModal(true)}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
              <Plus size={15} /> Add First Expense
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-slate-400">No expenses in this category.</div>
        ) : (
          <ul className="divide-y divide-[#f8f5f0]">
            {filtered.map(expense => {
              const cat = getCat(expense.category);
              return (
                <li key={expense.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#faf8f4] transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: cat.iconBg }}>
                    <cat.icon size={17} style={{ color: cat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: cat.iconBg, color: cat.textColor }}>{cat.label}</span>
                      {expense.note && <span className="text-xs text-slate-400 truncate">{expense.note}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{expense.expenseDate}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-gray-900">${expense.amountUSD.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">៛{expense.amountKHR.toLocaleString()}</p>
                  </div>
                  <button onClick={() => handleDelete(expense.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f5f2ec]">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900">Add Expense</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Track a new spending</p>
              </div>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-4 px-6 py-5">
              {/* Amount */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Amount (USD) *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amountUSD}
                    onChange={e => setForm(p => ({ ...p, amountUSD: e.target.value }))}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white" />
                </div>
                {form.amountUSD && parseFloat(form.amountUSD) > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">≈ ៛{Math.round(parseFloat(form.amountUSD) * rate).toLocaleString()} KHR</p>
                )}
              </div>

              {/* Category grid */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  Category *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(cat => {
                    const active = form.category === cat.value;
                    return (
                      <button key={cat.value} type="button"
                        onClick={() => setForm(p => ({ ...p, category: cat.value }))}
                        className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all active:scale-95"
                        style={active
                          ? { borderColor: cat.color, background: cat.iconBg }
                          : { borderColor: "#edeae4", background: "#faf8f4" }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: active ? cat.iconBg : "#f1ede8" }}>
                          <cat.icon size={15} style={{ color: active ? cat.color : "#94a3b8" }} />
                        </div>
                        <span className="leading-none text-center text-[10px] font-semibold"
                          style={{ color: active ? cat.textColor : "#94a3b8" }}>
                          {cat.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Date *</label>
                  <input type="date" value={form.expenseDate}
                    onChange={e => setForm(p => ({ ...p, expenseDate: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Note</label>
                  <input placeholder="e.g. Lunch" value={form.note}
                    onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white placeholder:text-slate-300" />
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : "Add Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Budget Modal */}
      {showBudget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#f5f2ec]">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900">Monthly Budget</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Set your spending limit in USD</p>
              </div>
              <button onClick={() => setShowBudget(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Budget (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                  <input type="number" min="0" step="1" value={budget}
                    onChange={e => setBudget(Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#e8e4da] text-sm outline-none focus:border-[#b98a2e] focus:ring-2 focus:ring-[rgba(201,168,76,0.18)] bg-white" />
                </div>
                {budget > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">≈ ៛{Math.round(budget * rate).toLocaleString()} KHR/month</p>
                )}
              </div>
              <div className="flex gap-2.5">
                <button type="button" onClick={() => setShowBudget(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#e8e4da] text-sm font-semibold text-slate-600 hover:bg-[#f5f2ec] active:scale-[0.97] transition-all">
                  Cancel
                </button>
                <button onClick={handleSaveBudget}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg, #b98a2e, #a6731d)" }}>
                  Save Budget
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
