"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Filter, List, Columns, CheckSquare } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
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
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterClient, setFilterClient] = useState("all");

  useEffect(() => {
    loadData();
  }, [user, filterStatus, filterPriority, filterClient]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase.from("tasks").select(`
        *,
        customer:customers(id, company_name, logo_url),
        project:projects(id, name),
        assigned_user:users(id, full_name),
        subtasks(id, completed)
      `).order("created_at", { ascending: false });

      if (user?.role === "employee") {
        query = query.eq("assigned_user_id", user.id);
      }
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (filterPriority !== "all") query = query.eq("priority", filterPriority);
      if (filterClient !== "all") query = query.eq("customer_id", filterClient);

      const [tasksRes, clientsRes, usersRes] = await Promise.all([
        query,
        supabase.from("customers").select("id, company_name").eq("status", "active"),
        supabase.from("users").select("id, full_name").eq("role", "employee").eq("status", "active"),
      ]);

      const tasksWithProgress = (tasksRes.data || []).map(task => ({
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
      headers: { "Content-Type": "application/json" },
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

  return (
    <div>
      <Header title="משימות" />
      <div className="p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "כל המשימות", value: stats.all, color: "text-[#0f172a]" },
            { label: "פתוחות", value: stats.open, color: "text-blue-600" },
            { label: "באיחור", value: stats.overdue, color: "text-red-600" },
            { label: "הושלמו", value: stats.completed, color: "text-green-600" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#e2e8f0] p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[#64748b]">{s.label}</p>
            </div>
          ))}
        </div>

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

          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> משימה חדשה
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-[#94a3b8]">
            <CheckSquare className="h-14 w-14 mx-auto mb-3 opacity-20" />
            <p>אין משימות להצגה</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filteredTasks.map(task => (
              <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onRefresh={loadData} />
            ))}
          </div>
        ) : (
          <TaskKanban tasks={filteredTasks} onStatusChange={handleStatusChange} onRefresh={loadData} />
        )}
      </div>

      {showForm && (
        <TaskFormDialog
          clients={clients}
          employees={employees}
          onClose={() => setShowForm(false)}
          onSave={loadData}
        />
      )}
    </div>
  );
}
