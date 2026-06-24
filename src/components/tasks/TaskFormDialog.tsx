"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X, RotateCcw, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { Customer, User, Task, Project } from "@/types";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

const DAYS_HE = [
  { key:"sun", label:"א׳" }, { key:"mon", label:"ב׳" }, { key:"tue", label:"ג׳" },
  { key:"wed", label:"ד׳" }, { key:"thu", label:"ה׳" }, { key:"fri", label:"ו׳" },
  { key:"sat", label:"ש׳" },
];

const schema = z.object({
  title: z.string().min(1, "שם משימה נדרש"),
  description: z.string().optional(),
  customer_id: z.string().min(1, "לקוח נדרש"),
  project_id: z.string().optional(),
  assigned_user_id: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]),
  status: z.enum(["new", "in_progress", "pending", "completed", "cancelled"]),
  due_date: z.string().optional(),
  notify_client_on_complete: z.boolean().optional(),
  notes: z.string().optional(),
  subtasks: z.array(z.object({ title: z.string().min(1) })).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_type: z.enum(["daily","weekly","monthly","yearly","custom"]).optional(),
  recurrence_interval: z.number().optional(),
  recurrence_days: z.array(z.string()).optional(),
  recurrence_end_type: z.enum(["never","date","count"]).optional(),
  recurrence_end_date: z.string().optional(),
  recurrence_end_count: z.number().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  task?: Task | null;
  clients: Customer[];
  employees: User[];
  onClose: () => void;
  onSave: () => void;
}

export default function TaskFormDialog({ task, clients, employees, onClose, onSave }: Props) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedClient, setSelectedClient] = useState(task?.customer_id || "");
  const [showRecurring, setShowRecurring] = useState(!!(task?.is_recurring));

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title || "",
      description: task?.description || "",
      customer_id: task?.customer_id || "",
      project_id: task?.project_id || "",
      assigned_user_id: task?.assigned_user_id || "",
      priority: task?.priority || "medium",
      status: task?.status || "new",
      due_date: task?.due_date ? task.due_date.split("T")[0] : "",
      notify_client_on_complete: task?.notify_client_on_complete || false,
      notes: task?.notes || "",
      subtasks: [],
      is_recurring: task?.is_recurring || false,
      recurrence_type: task?.recurrence_type || "weekly",
      recurrence_interval: task?.recurrence_interval || 1,
      recurrence_days: task?.recurrence_days || [],
      recurrence_end_type: task?.recurrence_end_type || "never",
      recurrence_end_date: task?.recurrence_end_date || "",
      recurrence_end_count: task?.recurrence_end_count || 10,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "subtasks" });

  const watchedClient = watch("customer_id");

  useEffect(() => {
    if (watchedClient) {
      setSelectedClient(watchedClient);
      loadProjects(watchedClient);
    }
  }, [watchedClient]);

  const loadProjects = async (clientId: string) => {
    const { data } = await supabase.from("projects").select("id, name").eq("customer_id", clientId);
    setProjects(data || []);
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const taskData = {
        title: data.title,
        description: data.description || null,
        customer_id: data.customer_id,
        project_id: data.project_id || null,
        assigned_user_id: data.assigned_user_id || null,
        priority: data.priority,
        status: data.status,
        due_date: data.due_date || null,
        notify_client_on_complete: data.notify_client_on_complete || false,
        notes: data.notes || null,
        created_by: user?.id,
        is_recurring: data.is_recurring || false,
        recurrence_type: data.is_recurring ? data.recurrence_type : null,
        recurrence_interval: data.is_recurring ? (data.recurrence_interval || 1) : null,
        recurrence_days: data.is_recurring && data.recurrence_type === "weekly" ? (data.recurrence_days || []) : null,
        recurrence_end_type: data.is_recurring ? data.recurrence_end_type : null,
        recurrence_end_date: data.is_recurring && data.recurrence_end_type === "date" ? data.recurrence_end_date : null,
        recurrence_end_count: data.is_recurring && data.recurrence_end_type === "count" ? data.recurrence_end_count : null,
      };

      if (task?.id) {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, ...taskData }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      } else {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...taskData, subtasks: data.subtasks || [] }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      }

      toast.success(task ? "המשימה עודכנה" : "המשימה נוצרה");
      onSave();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "שגיאה בשמירה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? "עריכת משימה" : "משימה חדשה"}</DialogTitle>
        </DialogHeader>

        <form className="px-6 pb-2 space-y-4">
          <div className="space-y-1.5">
            <Label>שם המשימה *</Label>
            <Input {...register("title")} placeholder="שם המשימה" />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>תיאור</Label>
            <Textarea {...register("description")} placeholder="תיאור המשימה..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>לקוח *</Label>
              <Select value={watch("customer_id")} onValueChange={v => setValue("customer_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר לקוח" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.customer_id && <p className="text-xs text-red-500">{errors.customer_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>פרויקט</Label>
              <Select value={watch("project_id") || ""} onValueChange={v => setValue("project_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר פרויקט (אופציונלי)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">ללא פרויקט</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>עובד אחראי</Label>
              <Select value={watch("assigned_user_id") || ""} onValueChange={v => setValue("assigned_user_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר עובד" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">לא הוקצה</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>תאריך יעד</Label>
              <Input {...register("due_date")} type="date" />
            </div>

            <div className="space-y-1.5">
              <Label>עדיפות</Label>
              <Select value={watch("priority")} onValueChange={v => setValue("priority", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">גבוהה</SelectItem>
                  <SelectItem value="medium">בינונית</SelectItem>
                  <SelectItem value="low">נמוכה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>סטטוס</Label>
              <Select value={watch("status")} onValueChange={v => setValue("status", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">חדש</SelectItem>
                  <SelectItem value="in_progress">בטיפול</SelectItem>
                  <SelectItem value="pending">ממתין</SelectItem>
                  <SelectItem value="completed">הושלם</SelectItem>
                  <SelectItem value="cancelled">בוטל</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subtasks */}
          {!task && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>תתי משימות</Label>
                <button
                  type="button"
                  onClick={() => append({ title: "" })}
                  className="text-xs text-[#16a34a] flex items-center gap-1 hover:underline"
                >
                  <Plus className="h-3 w-3" /> הוסף
                </button>
              </div>
              {fields.map((field, idx) => (
                <div key={field.id} className="flex gap-2 items-center">
                  <span className="text-[#94a3b8] text-sm">☐</span>
                  <Input {...register(`subtasks.${idx}.title`)} placeholder="תת משימה..." className="flex-1" />
                  <button type="button" onClick={() => remove(idx)} className="text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Recurring task */}
          <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => { setShowRecurring(!showRecurring); setValue("is_recurring", !showRecurring); }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f8fafc] transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[#374151]">
                <RotateCcw className="h-4 w-4 text-[#16a34a]" /> משימה חוזרת
                {showRecurring && <span className="text-xs bg-[#16a34a] text-white px-1.5 py-0.5 rounded-full">פעיל</span>}
              </span>
              <ChevronDown className={`h-4 w-4 text-[#94a3b8] transition-transform ${showRecurring ? "rotate-180" : ""}`} />
            </button>

            {showRecurring && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t border-[#f1f5f9] bg-[#f8fafc]">
                {/* Frequency */}
                <div className="space-y-1.5">
                  <Label>תדירות</Label>
                  <Select value={watch("recurrence_type") || "weekly"} onValueChange={v => setValue("recurrence_type", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">יומי</SelectItem>
                      <SelectItem value="weekly">שבועי</SelectItem>
                      <SelectItem value="monthly">חודשי</SelectItem>
                      <SelectItem value="yearly">שנתי</SelectItem>
                      <SelectItem value="custom">מותאם אישית</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Interval for custom */}
                {(watch("recurrence_type") === "custom" || watch("recurrence_type") === "daily") && (
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap">כל</Label>
                    <Input type="number" min={1} className="w-20"
                      {...register("recurrence_interval", { valueAsNumber: true })} />
                    <span className="text-sm text-[#64748b]">
                      {watch("recurrence_type") === "daily" ? "ימים" : "ימים"}
                    </span>
                  </div>
                )}

                {/* Days of week for weekly */}
                {watch("recurrence_type") === "weekly" && (
                  <div className="space-y-1.5">
                    <Label>ימים בשבוע</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAYS_HE.map(({ key, label }) => {
                        const days = watch("recurrence_days") || [];
                        const active = days.includes(key);
                        return (
                          <button key={key} type="button"
                            onClick={() => setValue("recurrence_days",
                              active ? days.filter(d => d !== key) : [...days, key]
                            )}
                            className={`w-9 h-9 rounded-full text-sm font-medium border transition-colors ${
                              active ? "bg-[#16a34a] text-white border-[#16a34a]" : "border-[#e2e8f0] text-[#374151] hover:border-[#16a34a]"
                            }`}
                          >{label}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Monthly day */}
                {watch("recurrence_type") === "monthly" && (
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap">ביום</Label>
                    <Input type="number" min={1} max={31} className="w-20"
                      {...register("recurrence_interval", { valueAsNumber: true })} />
                    <span className="text-sm text-[#64748b]">לחודש</span>
                  </div>
                )}

                {/* End condition */}
                <div className="space-y-1.5">
                  <Label>סיום חזרתיות</Label>
                  <Select value={watch("recurrence_end_type") || "never"} onValueChange={v => setValue("recurrence_end_type", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">ללא הגבלה</SelectItem>
                      <SelectItem value="date">עד תאריך</SelectItem>
                      <SelectItem value="count">מספר מופעים</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {watch("recurrence_end_type") === "date" && (
                  <div className="space-y-1.5">
                    <Label>תאריך סיום</Label>
                    <Input type="date" {...register("recurrence_end_date")} />
                  </div>
                )}
                {watch("recurrence_end_type") === "count" && (
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap">מספר פעמים</Label>
                    <Input type="number" min={1} className="w-24"
                      {...register("recurrence_end_count", { valueAsNumber: true })} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notify client */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register("notify_client_on_complete")} className="rounded" />
            <span className="text-sm text-[#374151]">שלח מייל ללקוח בעת השלמת המשימה</span>
          </label>

          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea {...register("notes")} placeholder="הערות נוספות..." rows={2} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={loading}>
            {task ? "שמור שינויים" : "צור משימה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
