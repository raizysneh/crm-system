"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { Customer, Project } from "@/types";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

const schema = z.object({
  name: z.string().min(1, "שם פרויקט נדרש"),
  customer_id: z.string().min(1, "לקוח נדרש"),
  description: z.string().optional(),
  status: z.enum(["new", "active", "pending", "completed", "cancelled"]),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  project?: Project | null;
  clients: Customer[];
  onClose: () => void;
  onSave: () => void;
}

export default function ProjectFormDialog({ project, clients, onClose, onSave }: Props) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name || "",
      customer_id: project?.customer_id || "",
      description: project?.description || "",
      status: project?.status || "new",
      start_date: project?.start_date?.split("T")[0] || "",
      due_date: project?.due_date?.split("T")[0] || "",
      notes: project?.notes || "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const projectData = {
        name: data.name,
        customer_id: data.customer_id,
        description: data.description || null,
        status: data.status,
        start_date: data.start_date || null,
        due_date: data.due_date || null,
        notes: data.notes || null,
        created_by: user?.id,
      };

      if (project?.id) {
        const { error } = await supabase.from("projects").update(projectData).eq("id", project.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert(projectData);
        if (error) throw error;
      }

      toast.success(project ? "הפרויקט עודכן" : "הפרויקט נוצר");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "עריכת פרויקט" : "פרויקט חדש"}</DialogTitle>
        </DialogHeader>

        <form className="px-6 pb-2 space-y-4">
          <div className="space-y-1.5">
            <Label>שם הפרויקט *</Label>
            <Input {...register("name")} placeholder="שם הפרויקט" />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>לקוח *</Label>
            <Select value={watch("customer_id")} onValueChange={v => setValue("customer_id", v)}>
              <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.customer_id && <p className="text-xs text-red-500">{errors.customer_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>תיאור</Label>
            <Textarea {...register("description")} placeholder="תיאור הפרויקט..." rows={3} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>סטטוס</Label>
              <Select value={watch("status")} onValueChange={v => setValue("status", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">חדש</SelectItem>
                  <SelectItem value="active">פעיל</SelectItem>
                  <SelectItem value="pending">ממתין</SelectItem>
                  <SelectItem value="completed">הושלם</SelectItem>
                  <SelectItem value="cancelled">בוטל</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>תאריך התחלה</Label>
              <Input {...register("start_date")} type="date" />
            </div>
            <div className="space-y-1.5">
              <Label>תאריך יעד</Label>
              <Input {...register("due_date")} type="date" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea {...register("notes")} placeholder="הערות..." rows={2} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={loading}>
            {project ? "שמור שינויים" : "צור פרויקט"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
