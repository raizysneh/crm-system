"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase, authHeader } from "@/lib/supabase/client";
import { Customer } from "@/types";
import { toast } from "sonner";

const schema = z.object({
  company_name: z.string().min(1, "שם חברה נדרש"),
  contact_name: z.string().optional(),
  email: z.string().email("מייל לא תקין").optional().or(z.literal("")),
  notes: z.string().optional(),
  monthly_hours: z.coerce.number().min(0).optional(),
  renewal_day: z.coerce.number().min(1).max(31).optional(),
  alert_percentage: z.coerce.number().min(0).max(100).optional(),
  phones: z.array(z.object({
    phone: z.string().min(1, "טלפון נדרש"),
    label: z.string().optional(),
  })).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  client?: Customer | null;
  onClose: () => void;
  onSave: () => void;
}

export default function ClientFormDialog({ client, onClose, onSave }: Props) {
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, control, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: client?.company_name || "",
      contact_name: client?.contact_name || "",
      email: client?.email || "",
      notes: client?.notes || "",
      monthly_hours: client?.monthly_hours || undefined,
      renewal_day: client?.renewal_day || 1,
      alert_percentage: client?.alert_percentage || 80,
      phones: client?.phones?.map(p => ({ phone: p.phone, label: p.label || "" })) || [{ phone: "", label: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "phones" });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const customerData = {
        company_name: data.company_name,
        contact_name: data.contact_name || null,
        email: data.email || null,
        notes: data.notes || null,
        monthly_hours: data.monthly_hours || null,
        renewal_day: data.renewal_day || null,
        alert_percentage: data.alert_percentage || 80,
      };

      const phones = (data.phones || []).filter(p => p.phone.trim());

      if (client?.id) {
        const res = await fetch("/api/customers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ id: client.id, ...customerData, phones }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      } else {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ ...customerData, phones }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      }

      toast.success(client ? "הלקוח עודכן" : "הלקוח נוצר");
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
          <DialogTitle>{client ? "עריכת לקוח" : "לקוח חדש"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 px-6 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>שם החברה *</Label>
              <Input {...register("company_name")} placeholder="שם העסק" />
              {errors.company_name && <p className="text-xs text-red-500">{errors.company_name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>איש קשר</Label>
              <Input {...register("contact_name")} placeholder="שם איש הקשר" />
            </div>

            <div className="space-y-1.5">
              <Label>מייל</Label>
              <Input {...register("email")} type="email" placeholder="email@example.com" dir="ltr" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
          </div>

          {/* Phones */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>טלפונים</Label>
              <button type="button" onClick={() => append({ phone: "", label: "" })} className="text-xs text-[#16a34a] flex items-center gap-1 hover:underline">
                <Plus className="h-3 w-3" /> הוסף טלפון
              </button>
            </div>
            {fields.map((field, idx) => (
              <div key={field.id} className="flex gap-2">
                <Input {...register(`phones.${idx}.phone`)} placeholder="050-0000000" dir="ltr" className="flex-1" />
                <Input {...register(`phones.${idx}.label`)} placeholder="תווית (נייד, משרד...)" className="w-36" />
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(idx)} className="text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Hours Package */}
          <div className="bg-[#f8fafc] rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium text-[#374151]">חבילת שעות חודשית</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>שעות בחודש</Label>
                <Input {...register("monthly_hours")} type="number" min="0" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>יום חידוש</Label>
                <Input {...register("renewal_day")} type="number" min="1" max="31" placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <Label>התראה ב-%</Label>
                <Input {...register("alert_percentage")} type="number" min="0" max="100" placeholder="80" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea {...register("notes")} placeholder="הערות על הלקוח..." rows={3} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={loading}>
            {client ? "שמור שינויים" : "צור לקוח"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
