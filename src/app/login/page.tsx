"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Building2, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("כתובת מייל לא תקינה"),
  password: z.string().min(1, "סיסמה נדרשת"),
  remember: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes("Invalid login")) {
          toast.error("כתובת מייל או סיסמה שגויים");
        } else {
          toast.error(error.message);
        }
        return;
      }

      router.push("/dashboard");
    } catch {
      toast.error("שגיאה בהתחברות, נסה שוב");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      toast.error("הכנס כתובת מייל");
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("קישור לאיפוס סיסמה נשלח למייל שלך");
      setShowForgot(false);
    } catch {
      toast.error("שגיאה בשליחת המייל");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#16a34a] rounded-2xl mb-4 shadow-lg">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#0f172a]">מערכת CRM</h1>
          <p className="text-[#64748b] text-sm mt-1">ניהול לקוחות, משימות ועובדים</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-[#e2e8f0] p-8">
          {!showForgot ? (
            <>
              <h2 className="text-xl font-semibold text-[#0f172a] mb-6 text-center">התחברות למערכת</h2>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email">כתובת מייל</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      className="pr-10"
                      autoComplete="email"
                      dir="ltr"
                      {...register("email")}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-500">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">סיסמה</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pr-10 pl-10"
                      autoComplete="current-password"
                      dir="ltr"
                      {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-500">{errors.password.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" {...register("remember")} />
                    <span className="text-sm text-[#64748b]">זכור אותי</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-sm text-[#16a34a] hover:underline"
                  >
                    שכחתי סיסמה
                  </button>
                </div>

                <Button type="submit" className="w-full h-10" loading={isLoading}>
                  {isLoading ? "מתחבר..." : "התחבר"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-[#0f172a] mb-2 text-center">איפוס סיסמה</h2>
              <p className="text-sm text-[#64748b] text-center mb-6">
                הכנס את כתובת המייל שלך ונשלח לך קישור לאיפוס
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">כתובת מייל</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="name@company.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <Button onClick={handleForgotPassword} className="w-full h-10" loading={forgotLoading}>
                  שלח קישור לאיפוס
                </Button>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="w-full text-sm text-[#64748b] hover:text-[#0f172a]"
                >
                  חזרה להתחברות
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-[#94a3b8] mt-6">
          מערכת CRM &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
