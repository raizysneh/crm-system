"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User } from "@/types";
import { toast } from "sonner";

const schema = z.object({
  full_name: z.string().min(1, "שם מלא נדרש"),
  email: z.string().email("מייל לא תקין"),
  role: z.enum(["admin", "employee", "client"]),
  phone: z.string().optional(),
  password: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  user?: User | null;
  onClose: () => void;
  onSave: () => void;
}

export default function UserFormDialog({ user, onClose, onSave }: Props) {
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: user?.full_name || "",
      email: user?.email || "",
      role: user?.role || "employee",
      phone: user?.phone || "",
      password: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      if (user?.id) {
        const res = await fetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: user.id,
            full_name: data.full_name,
            role: data.role,
            phone: data.phone,
            password: data.password || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      } else {
        if (!data.password || data.password.length < 6) {
          toast.error("סיסמה חייבת להיות לפחות 6 תווים");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      }

      toast.success(user ? "המשתמש עודכן" : "המשתמש נוצר בהצלחה");
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "עריכת משתמש" : "משתמש חדש"}</DialogTitle>
        </DialogHeader>

        <form className="px-6 pb-2 space-y-4">
          <div className="space-y-1.5">
            <Label>שם מלא *</Label>
            <Input {...register("full_name")} placeholder="שם מלא" />
            {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>מייל *</Label>
            <Input {...register("email")} type="email" placeholder="email@example.com" dir="ltr" disabled={!!user} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>טלפון</Label>
            <Input {...register("phone")} placeholder="050-0000000" dir="ltr" />
          </div>

          <div className="space-y-1.5">
            <Label>תפקיד</Label>
            <Select value={watch("role")} onValueChange={v => setValue("role", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">מנהל מערכת</SelectItem>
                <SelectItem value="employee">עובד</SelectItem>
                <SelectItem value="client">לקוח</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{user ? "סיסמה חדשה (השאר ריק לשמירה)" : "סיסמה *"}</Label>
            <Input {...register("password")} type="password" placeholder="••••••" dir="ltr" />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>

          {!user && (
            <p className="text-xs text-[#64748b] bg-[#f8fafc] rounded-lg p-3">
              המשתמש יקבל הודעה למייל עם פרטי ההתחברות. יש לוודא שה-SUPABASE_SERVICE_ROLE_KEY הוגדר ב-.env.local
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={loading}>
            {user ? "שמור שינויים" : "צור משתמש"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
