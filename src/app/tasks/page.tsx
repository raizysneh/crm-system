"use client";

import { useState, useEffect } from "react";
import { Plus, Search, List, Columns, CheckSquare, AlertTriangle, Check, X, Archive, CalendarClock } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, authHeader } from "@/lib/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Task, Customer, User } from "@/types";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import TaskCard from "@/components/tasks/TaskCard";
import TaskKanban from "@/components/tasks/TaskKanban";
import TaskFormDialog from "@/components/tasks/TaskFormDialog";
import Link from "next/link";

type ViewMode = "list" | "kanban";

export default function TasksPage() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  // "me" = show only own tasks (default for everyone), "all" = all tasks (admin only), or specific user id
  const [filterEmployee, setFilterEmployee] = useState("me");
  const [showArchive, setShowArchive] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [showFuture, setShowFuture] = useState(false);

  useEffect(() => {
    loadData();
  }, [user, filterStatus, filterPriority, filterClient, filterEmployee, showArchive, showFuture]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (user?.role === "employee") {
        // Employees always see only their own tasks
        params.set("role", "employee");
        params.set("user_id", user.id);
      } else if (user?.role === "admin") {
        if (filterEmployee === "me") {
          params.set("role", "admin");
          params.set("user_id", user.id);
        } else if (filterEmployee !== "all") {
          params.set("role", "employee");
          params.set("user_id", filterEmployee);
        }
        // "all" → no user_id filter → returns everything
      }

      if (showArchive) {
        params.set("status", "completed");
      } else if (filterStatus !== "all") {
        params.set("status", filterStatus);
      } else {
        params.set("exclude_completed", "true");
      }
      if (!showFuture && !showArchive) params.set("hide_future", "true");
      if (filterPriority !== "all") params.set("priority", filterPriority);
      if (filterClient !== "all")   params.set("customer_id", filterClient);

      // Count archived (completed) tasks for the badge
      const archiveParams = new URLSearchParams(params);
      archiveParams.set("status", "completed");
      archiveParams.delete("exclude_completed");

      const h = await authHeader();
      const [tasksRes, clientsRes, usersRes, archiveRes] = await Promise.all([
        fetch(`/api/tasks?${params}`, { headers: h }).then(r => r.json()),
        supabase.from("customers").select("id, company_name").eq("status", "active"),
        supabase.from("users").select("id, full_name").in("role", ["admin","employee"]).eq("status", "active"),
        fetch(`/api/tasks?${archiveParams}`, { headers: h }).then(r => r.json()),
      ]);

      if (tasksRes.error) throw new Error(tasksRes.error);
      setArchivedCount((archiveRes.data || []).length);

      const tasksWithProgress = (tasksRes.data || []).map((task: any) => ({
        ...task,
        subtasks_count: task.subtasks?.length || 0,
        completed_subtasks: task.subtasks?.filter((s: any) => s.completed).length || 0,
        progress: task.subtasks?.length
          ? Math.round((task.subtasks.filter((s: any) => s.completed).length / task.subtasks.length) * 100)
          : 0,
      }));

      setTasks(tasksWithProgress);
      setClients(clientsRes.data || []);
      setEmployees(usersRes.data || []);
    } catch {
      toast.error("שגיאה בטעינת משימות");
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.customer?.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleStatusChange = async (taskId: string, status: string) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ id: taskId, status }),
    });
    if (!res.ok) toast.error("שגיאה בעדכון סטטוס");
    else setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: status as any } : t));
  };

  const stats = {
    all: tasks.length,
    open: tasks.filter(t => !["completed", "cancelled"].includes(t.status)).length,
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed").length,
    completed: tasks.filter(t => t.status === "completed").length,
  };

  const pendingDeletion = tasks.filter(t => t.pending_deletion);

  const handleApproveDeletion = async (taskId: string) => {
    const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE", headers: await authHeader() });
    if (!res.ok) {
      toast.error("שגיאה במחיקה");
      return;
    }
    toast.success("המשימה נמחקה");
    loadData();
  };

  const handleRejectDeletion = async (taskId: string) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ id: taskId, pending_deletion: false }),
    });
    toast.success("בקשת המחיקה נדחתה");
    loadData();
  };

  return (
    <div>
      <Header title="משימות" />
      <div className="p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "כל המשימות", value: stats.all,     color: "text-[#0f172a]", bg: "bg-white",        border: "border-[#e2e8f0]", dot: "bg-[#94a3b8]" },
            { label: "פתוחות",      value: stats.open,    color: "text-blue-600",  bg: "bg-blue-50/60",   border: "border-blue-100",  dot: "bg-blue-400" },
            { label: "באיחור",      value: stats.overdue, color: "text-red-500",   bg: "bg-red-50/60",    border: "border-red-100",   dot: "bg-red-400" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl border ${s.border} p-4 flex items-center gap-3`}>
              <div className={`w-2.5 h-2.5 rounded-full ${s.dot} shrink-0`} />
              <div>
                <p className={`text-2xl font-bold leading-none ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[#64748b] mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
          {/* Archive card */}
          <button
            onClick={() => setShowArchive(v => !v)}
            className={`rounded-xl border p-4 flex items-center gap-3 transition-all text-right w-full ${
              showArchive
                ? "bg-green-100 border-green-300"
                : "bg-green-50/60 border-green-100 hover:bg-green-100"
            }`}
          >
            <Archive className={`w-4 h-4 shrink-0 ${showArchive ? "text-green-700" : "text-green-400"}`} />
            <div>
              <p className={`text-2xl font-bold leading-none ${showArchive ? "text-green-700" : "text-green-600"}`}>{archivedCount}</p>
              <p className="text-xs text-[#64748b] mt-0.5">ארכיון</p>
            </div>
          </button>
        </div>

        {/* Pending deletion approval — admin only */}
        {user?.role === "admin" && pendingDeletion.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <p className="text-sm font-semibold text-red-700">בקשות מחיקה ממתינות לאישור ({pendingDeletion.length})</p>
            </div>
            <div className="space-y-2">
              {pendingDeletion.map(t => (
                <div key={t.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-red-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f172a] truncate">{t.title}</p>
                    <p className="text-xs text-[#64748b]">{t.customer?.company_name}</p>
                  </div>
                  <button
                    onClick={() => handleApproveDeletion(t.id)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" /> אשר מחיקה
                  </button>
                  <button
                    onClick={() => handleRejectDeletion(t.id)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-[#e2e8f0] text-[#374151] rounded-lg hover:bg-[#f8fafc] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> דחה
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
            <Input placeholder="חיפוש משימה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="סטטוס" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="new">חדש</SelectItem>
              <SelectItem value="in_progress">בטיפול</SelectItem>
              <SelectItem value="pending">ממתין</SelectItem>
              <SelectItem value="completed">הושלם</SelectItem>
              <SelectItem value="cancelled">בוטל</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-32"><SelectValue placeholder="עדיפות" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל העדיפויות</SelectItem>
              <SelectItem value="high">גבוהה</SelectItem>
              <SelectItem value="medium">בינונית</SelectItem>
              <SelectItem value="low">נמוכה</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-44"><SelectValue placeholder="לקוח" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הלקוחות</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Admin-only: filter by assignee */}
          {user?.role === "admin" && (
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-44"><SelectValue placeholder="הצג משימות של" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">המשימות שלי</SelectItem>
                <SelectItem value="all">כולם</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center border border-[#e2e8f0] rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 ${viewMode === "list" ? "bg-[#16a34a] text-white" : "text-[#64748b] hover:bg-[#f1f5f9]"}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-2 ${viewMode === "kanban" ? "bg-[#16a34a] text-white" : "text-[#64748b] hover:bg-[#f1f5f9]"}`}
            >
              <Columns className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setShowFuture(v => !v)}
            title="הצג/הסתר משימות עתידיות"
            className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors ${
              showFuture
                ? "bg-purple-100 border-purple-300 text-purple-700"
                : "bg-white border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9]"
            }`}
          >
            <CalendarClock className="h-4 w-4" />
            עתידיות
          </button>

          <Button onClick={() => { setEditTask(null); setShowForm(true); }}>
            <Plus className="h-4 w-4" /> משימה חדשה
          </Button>
        </div>

        {/* Archive banner */}
        {showArchive && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5">
            <Archive className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm font-medium text-green-700">ארכיון — משימות שהושלמו</span>
            <button onClick={() => setShowArchive(false)} className="mr-auto text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> סגור ארכיון
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-[#94a3b8]">
            <CheckSquare className="h-14 w-14 mx-auto mb-3 opacity-20" />
            <p>אין משימות להצגה</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filteredTasks.map(task => (
              <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onRefresh={loadData}
                onEdit={t => { setEditTask(t); setShowForm(true); }} />
            ))}
          </div>
        ) : (
          <TaskKanban tasks={filteredTasks} onStatusChange={handleStatusChange} onRefresh={loadData} />
        )}
      </div>

      {showForm && (
        <TaskFormDialog
          task={editTask}
          clients={clients}
          employees={employees}
          onClose={() => { setShowForm(false); setEditTask(null); }}
          onSave={loadData}
        />
      )}
    </div>
  );
}
