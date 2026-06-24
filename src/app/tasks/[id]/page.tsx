"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Timer, Edit, Plus, Trash2, Check, GripVertical } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { Task, Subtask, TimeEntry, Customer, User } from "@/types";
import { toast } from "sonner";
import { formatDateTime, formatHours, getStatusLabel, getStatusColor, getPriorityColor } from "@/lib/utils";
import { useTimerStore } from "@/store/timerStore";
import Link from "next/link";

export default function TaskDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { startTimer } = useTimerStore();
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  useEffect(() => { loadTask(); }, [id]);

  const loadTask = async () => {
    setLoading(true);
    try {
      const [taskRes, subtasksRes, timeRes] = await Promise.all([
        supabase.from("tasks").select(`
          *,
          customer:customers(id, company_name, logo_url),
          project:projects(id, name),
          assigned_user:users(id, full_name)
        `).eq("id", id).single(),
        supabase.from("subtasks").select("*").eq("task_id", id).order("sort_order"),
        supabase.from("time_entries").select("*, user:users(full_name)").eq("task_id", id).order("start_time", { ascending: false }),
      ]);

      if (taskRes.error) throw taskRes.error;
      setTask(taskRes.data);
      setSubtasks(subtasksRes.data || []);
      setTimeEntries(timeRes.data || []);
    } catch {
      toast.error("שגיאה בטעינת המשימה");
      router.push("/tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    const res = await fetch("/api/subtasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: subtask.id,
        completed: !subtask.completed,
        completed_at: !subtask.completed ? new Date().toISOString() : null,
      }),
    });
    if (!res.ok) { toast.error("שגיאה בעדכון"); return; }
    setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, completed: !s.completed } : s));
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    setAddingSubtask(true);
    const res = await fetch("/api/subtasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: id, title: newSubtask.trim(), completed: false, sort_order: subtasks.length }),
    });
    const json = await res.json();
    if (!res.ok) toast.error("שגיאה בהוספה");
    else { setSubtasks(prev => [...prev, json.data]); setNewSubtask(""); }
    setAddingSubtask(false);
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    const res = await fetch(`/api/subtasks?id=${subtaskId}`, { method: "DELETE" });
    if (!res.ok) toast.error("שגיאה במחיקה");
    else setSubtasks(prev => prev.filter(s => s.id !== subtaskId));
  };

  const handleStatusChange = async (status: string) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) toast.error("שגיאה בעדכון");
    else setTask(prev => prev ? { ...prev, status: status as any } : null);
  };

  const handleStartTimer = () => {
    if (!task?.customer) return;
    startTimer({
      customer_id: task.customer_id,
      customer_name: task.customer.company_name,
      task_id: task.id,
      task_title: task.title,
      project_id: task.project_id,
      project_name: task.project?.name,
    });
    toast.success("טיימר הופעל");
  };

  if (loading || !task) return <div className="p-8 animate-pulse"><div className="h-8 bg-gray-200 rounded w-48" /></div>;

  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const progress = subtasks.length ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;
  const totalHours = timeEntries.reduce((sum, e) => sum + (e.duration || 0), 0);

  return (
    <div>
      <Header />
      <div className="p-6 space-y-5">
        {/* Back */}
        <div className="flex items-center gap-3">
          <Link href="/tasks" className="text-[#64748b] hover:text-[#0f172a]">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-[#0f172a] flex-1">{task.title}</h1>
          <Button size="sm" variant="outline" onClick={handleStartTimer}>
            <Timer className="h-4 w-4" /> הפעל טיימר
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* Main content */}
          <div className="col-span-2 space-y-4">
            {/* Info card */}
            <Card>
              <CardContent className="p-5 space-y-4">
                {task.description && (
                  <p className="text-sm text-[#374151] leading-relaxed">{task.description}</p>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[#64748b] mb-0.5">לקוח</p>
                    <Link href={`/clients/${task.customer_id}`} className="font-medium text-[#16a34a] hover:underline">
                      {task.customer?.company_name}
                    </Link>
                  </div>
                  {task.project && (
                    <div>
                      <p className="text-[#64748b] mb-0.5">פרויקט</p>
                      <p className="font-medium">{task.project.name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[#64748b] mb-0.5">עובד אחראי</p>
                    <p className="font-medium">{task.assigned_user?.full_name || "לא הוקצה"}</p>
                  </div>
                  <div>
                    <p className="text-[#64748b] mb-0.5">תאריך יעד</p>
                    <p className="font-medium">{task.due_date ? new Date(task.due_date).toLocaleDateString("he-IL") : "ללא"}</p>
                  </div>
                  <div>
                    <p className="text-[#64748b] mb-0.5">עדיפות</p>
                    <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "warning" : "success"}>
                      {task.priority === "high" ? "גבוהה" : task.priority === "medium" ? "בינונית" : "נמוכה"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[#64748b] mb-0.5">סטטוס</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(task.status)}`}>
                      {getStatusLabel(task.status)}
                    </span>
                  </div>
                </div>

                {task.notes && (
                  <div className="pt-3 border-t border-[#f1f5f9]">
                    <p className="text-xs text-[#64748b] mb-1">הערות</p>
                    <p className="text-sm text-[#374151]">{task.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subtasks */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[#0f172a]">תתי משימות</h2>
                  {subtasks.length > 0 && (
                    <span className="text-sm text-[#64748b]">{completedSubtasks}/{subtasks.length} הושלמו</span>
                  )}
                </div>

                {subtasks.length > 0 && (
                  <div className="mb-4">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-[#94a3b8] mt-1">{progress}% הושלם</p>
                  </div>
                )}

                <div className="space-y-2">
                  {subtasks.map(subtask => (
                    <div key={subtask.id} className="flex items-center gap-3 group">
                      <button
                        onClick={() => handleToggleSubtask(subtask)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          subtask.completed ? "bg-[#16a34a] border-[#16a34a]" : "border-[#cbd5e1] hover:border-[#16a34a]"
                        }`}
                      >
                        {subtask.completed && <Check className="h-3 w-3 text-white" />}
                      </button>
                      <span className={`flex-1 text-sm ${subtask.completed ? "line-through text-[#94a3b8]" : "text-[#374151]"}`}>
                        {subtask.title}
                      </span>
                      <button
                        onClick={() => handleDeleteSubtask(subtask.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add subtask */}
                <div className="flex gap-2 mt-3">
                  <Input
                    placeholder="הוסף תת משימה..."
                    value={newSubtask}
                    onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddSubtask()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleAddSubtask} loading={addingSubtask} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status change */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-[#374151] mb-3">שינוי סטטוס</p>
                {["new", "in_progress", "pending", "completed", "cancelled"].map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`w-full text-right text-sm px-3 py-2 rounded-lg transition-colors ${
                      task.status === s
                        ? "bg-[#16a34a] text-white"
                        : "hover:bg-[#f1f5f9] text-[#374151]"
                    }`}
                  >
                    {getStatusLabel(s)}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Timer stats */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-[#374151] mb-2">שעות עבודה</p>
                <p className="text-2xl font-bold text-[#16a34a]">{formatHours(totalHours)}</p>
                <p className="text-xs text-[#94a3b8]">{timeEntries.length} רשומות</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Time entries */}
        {timeEntries.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold text-[#0f172a] mb-4">היסטוריית זמן</h2>
              <div className="divide-y divide-[#f1f5f9]">
                {timeEntries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#0f172a]">{entry.user?.full_name}</p>
                      <p className="text-xs text-[#64748b]">{entry.notes || ""}</p>
                    </div>
                    <div className="text-xs text-[#64748b] text-left" dir="ltr">
                      <p>{formatDateTime(entry.start_time)}</p>
                      {entry.end_time && <p>עד {formatDateTime(entry.end_time)}</p>}
                    </div>
                    <span className="font-mono text-sm font-medium text-[#16a34a]">
                      {formatHours(entry.duration || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
