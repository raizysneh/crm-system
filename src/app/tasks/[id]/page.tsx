"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Timer, Edit, Plus, Trash2, Check, GripVertical, Paperclip, Download, X, Upload, RotateCcw, Pencil } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { Task, Subtask, TimeEntry, Customer, User } from "@/types";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { formatDateTime, formatHours, getStatusLabel, getStatusColor, getPriorityColor } from "@/lib/utils";
import { useTimerStore } from "@/store/timerStore";
import Link from "next/link";
import TaskFormDialog from "@/components/tasks/TaskFormDialog";

interface Attachment {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_size?: number;
  uploaded_by?: string;
  created_at: string;
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { startTimer } = useTimerStore();
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clients, setClients] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [sendCompletionEmail, setSendCompletionEmail] = useState(true);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadTask(); }, [id]);

  const loadTask = async () => {
    setLoading(true);
    try {
      const [taskRes, subtasksRes, timeRes, clientsRes, usersRes, attachRes] = await Promise.all([
        supabase.from("tasks").select(`*, customer:customers(id,company_name,logo_url), project:projects(id,name), assigned_user:users!assigned_user_id(id,full_name)`).eq("id", id).single(),
        supabase.from("subtasks").select("*").eq("task_id", id).order("sort_order"),
        supabase.from("time_entries").select("*, user:users!user_id(full_name)").eq("task_id", id).order("start_time", { ascending: false }),
        supabase.from("customers").select("id,company_name").eq("status","active"),
        supabase.from("users").select("id,full_name").in("role",["admin","employee"]).eq("status","active"),
        supabase.from("task_attachments").select("*").eq("task_id", id).order("created_at", { ascending: false }),
      ]);

      if (taskRes.error) throw taskRes.error;
      setTask(taskRes.data);
      setSubtasks(subtasksRes.data || []);
      setTimeEntries(timeRes.data || []);
      setClients(clientsRes.data || []);
      setEmployees(usersRes.data || []);
      setAttachments(attachRes.data || []);
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

  const handleSaveSubtaskTitle = async (subtaskId: string) => {
    const title = editingSubtaskTitle.trim();
    setEditingSubtaskId(null);
    if (!title) return;
    const res = await fetch("/api/subtasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: subtaskId, title }),
    });
    if (!res.ok) toast.error("שגיאה בעדכון");
    else setSubtasks(prev => prev.map(s => s.id === subtaskId ? { ...s, title } : s));
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
    if (!res.ok) { toast.error("שגיאה בעדכון"); return; }
    setTask(prev => prev ? { ...prev, status: status as any } : null);
    if (status === "completed" && sendCompletionEmail) {
      fetch("/api/task-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: id }),
      }).then(r => r.json()).then(j => {
        if (!j.skipped) toast.success("מייל השלמה נשלח");
      }).catch(() => {});
    }
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

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const path = `task-attachments/${id}/${Date.now()}-${file.name}`;
      const { data: upload, error: uploadErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: false });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
      const { data: row, error: dbErr } = await supabase.from("task_attachments").insert({
        task_id: id,
        file_name: file.name,
        file_url: publicUrl,
        file_size: file.size,
        uploaded_by: user.id,
      }).select().single();
      if (dbErr) throw dbErr;
      setAttachments(prev => [row as Attachment, ...prev]);
      toast.success("הקובץ הועלה בהצלחה");
    } catch (err: any) {
      toast.error("שגיאה בהעלאת הקובץ: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (att: Attachment) => {
    if (!confirm("למחוק קובץ זה?")) return;
    const urlParts = att.file_url.split("/attachments/");
    if (urlParts[1]) {
      await supabase.storage.from("attachments").remove([urlParts[1]]);
    }
    await supabase.from("task_attachments").delete().eq("id", att.id);
    setAttachments(prev => prev.filter(a => a.id !== att.id));
    toast.success("הקובץ נמחק");
  };

  if (loading || !task) return <div className="p-8 animate-pulse"><div className="h-8 bg-gray-200 rounded w-48" /></div>;

  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const progress = subtasks.length ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;
  const totalHours = timeEntries.reduce((sum, e) => sum + (e.duration || 0), 0);

  return (
    <>
    <div>
      <Header />
      <div className="p-6 space-y-5">
        {/* Back */}
        <div className="flex items-center gap-3">
          <Link href="/tasks" className="text-[#64748b] hover:text-[#0f172a]">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-[#0f172a] flex-1">{task.title}</h1>
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
            <Edit className="h-4 w-4" /> ערוך
          </Button>
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
                      {editingSubtaskId === subtask.id ? (
                        <input
                          autoFocus
                          value={editingSubtaskTitle}
                          onChange={e => setEditingSubtaskTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleSaveSubtaskTitle(subtask.id);
                            if (e.key === "Escape") setEditingSubtaskId(null);
                          }}
                          onBlur={() => handleSaveSubtaskTitle(subtask.id)}
                          className="flex-1 text-sm border border-[#16a34a] rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
                          dir="rtl"
                        />
                      ) : (
                        <span
                          className={`flex-1 text-sm ${subtask.completed ? "line-through text-[#94a3b8]" : "text-[#374151]"}`}
                          onDoubleClick={() => { setEditingSubtaskId(subtask.id); setEditingSubtaskTitle(subtask.title); }}
                        >
                          {subtask.title}
                        </span>
                      )}
                      {editingSubtaskId !== subtask.id && (
                        <button
                          onClick={() => { setEditingSubtaskId(subtask.id); setEditingSubtaskTitle(subtask.title); }}
                          className="opacity-0 group-hover:opacity-100 text-[#94a3b8] hover:text-[#374151] transition-colors"
                          title="ערוך"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
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
            {/* Attachments */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[#0f172a] flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-[#64748b]" /> קבצים מצורפים
                    {attachments.length > 0 && (
                      <span className="text-xs bg-[#f1f5f9] px-2 py-0.5 rounded-full text-[#64748b]">{attachments.length}</span>
                    )}
                  </h2>
                  <div>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile} />
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} loading={uploading}>
                      <Upload className="h-3.5 w-3.5" /> העלה קובץ
                    </Button>
                  </div>
                </div>

                {attachments.length === 0 ? (
                  <div
                    className="border-2 border-dashed border-[#e2e8f0] rounded-xl p-8 text-center cursor-pointer hover:border-[#16a34a] transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-8 w-8 mx-auto mb-2 text-[#cbd5e1]" />
                    <p className="text-sm text-[#94a3b8]">לחץ להעלאת קובץ</p>
                    <p className="text-xs text-[#cbd5e1] mt-0.5">כל סוגי הקבצים נתמכים</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#f1f5f9] hover:border-[#e2e8f0] group">
                        <div className="w-9 h-9 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center shrink-0">
                          <Paperclip className="h-4 w-4 text-[#64748b]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#0f172a] truncate">{att.file_name}</p>
                          {att.file_size && (
                            <p className="text-xs text-[#94a3b8]">{(att.file_size / 1024).toFixed(0)} KB</p>
                          )}
                        </div>
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-[#f1f5f9] text-[#64748b]"
                          title="הורד"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => handleDeleteAttachment(att)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="מחק"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                {task.status !== "completed" && (
                  <label className="flex items-center gap-2 mt-2 pt-2 border-t border-[#f1f5f9] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendCompletionEmail}
                      onChange={e => setSendCompletionEmail(e.target.checked)}
                      className="w-4 h-4 accent-[#16a34a]"
                    />
                    <span className="text-xs text-[#64748b]">שלח מייל בסיום ללקוח ולעובד</span>
                  </label>
                )}
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

            {/* Recurring info */}
            {task.is_recurring && (
              <Card className="border-[#bbf7d0] bg-[#f0fdf4]">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-[#16a34a] flex items-center gap-1.5 mb-2">
                    <RotateCcw className="h-4 w-4" /> משימה חוזרת
                  </p>
                  <div className="text-xs text-[#374151] space-y-1">
                    <p>תדירות: {{
                      daily: "יומי", weekly: "שבועי",
                      monthly: "חודשי", yearly: "שנתי", custom: "מותאם",
                    }[task.recurrence_type || ""] || task.recurrence_type}</p>
                    {task.recurrence_days?.length ? (
                      <p>ימים: {task.recurrence_days.join(", ")}</p>
                    ) : null}
                    {task.recurrence_end_type === "date" && task.recurrence_end_date && (
                      <p>עד: {new Date(task.recurrence_end_date).toLocaleDateString("he-IL")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
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

    {showEdit && task && (
      <TaskFormDialog
        task={task}
        clients={clients}
        employees={employees}
        onClose={() => setShowEdit(false)}
        onSave={() => { setShowEdit(false); loadTask(); }}
      />
    )}
    </>
  );
}
