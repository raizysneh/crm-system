"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Building2, Lock, Mail, ShieldOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Mode = "login" | "forgot" | "mfa-blocked";

const loginSchema = z.object({
  email: z.string().email("כתובת מייל לא תקינה"),
  password: z.string().min(1, "סיסמה נדרשת"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword]   = useState(false);
  const [isLoading,    setIsLoading]      = useState(false);
  const [forgotEmail,  setForgotEmail]    = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [mfaEmail,     setMfaEmail]       = useState("");
  const [mfaPassword,  setMfaPassword]    = useState("");
  const [mfaRemoving,  setMfaRemoving]    = useState(false);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  /* ── Login ── */
  const onLogin = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        toast.error(error.message.includes("Invalid login") ? "כתובת מייל או סיסמה שגויים" : error.message);
        return;
      }

      // MFA required: session is null even though no error
      if (!authData.session) {
        setMfaEmail(data.email);
        setMfaPassword(data.password);
        setMode("mfa-blocked");
        return;
      }

      router.push("/dashboard");
    } catch {
      toast.error("שגיאה בהתחברות, נסה שוב");
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Remove phone MFA and retry login ── */
  const handleRemoveMfa = async () => {
    setMfaRemoving(true);
    try {
      const res = await fetch("/api/disable-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mfaEmail, password: mfaPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "שגיאה בהסרת האימות");
        return;
      }

      // Retry login now that MFA is removed
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: mfaEmail,
        password: mfaPassword,
      });

      if (error || !authData.session) {
        toast.error("האימות הוסר — כעת נסי להתחבר שוב");
        setMode("login");
        return;
      }

      toast.success("האימות הוסר, מתחבר...");
      router.push("/dashboard");
    } catch {
      toast.error("שגיאה, נסי שוב");
    } finally {
      setMfaRemoving(false);
    }
  };

  /* ── Forgot password ── */
  const handleForgotPassword = async () => {
    if (!forgotEmail) { toast.error("הכנס כתובת מייל"); return; }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("קישור לאיפוס סיסמה נשלח למייל שלך");
      setMode("login");
    } catch {
      toast.error("שגיאה בשליחת המייל");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#16a34a] rounded-2xl mb-4 shadow-lg">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#0f172a]">מערכת CRM</h1>
          <p className="text-[#64748b] text-sm mt-1">ניהול לקוחות, משימות ועובדים</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-[#e2e8f0] overflow-hidden">
          <div className="p-8">

            {/* ── LOGIN ── */}
            {mode === "login" && (
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email">כתובת מייל</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                    <Input id="email" type="email" placeholder="name@company.com"
                      className="pr-10" autoComplete="email" dir="ltr"
                      {...loginForm.register("email")} />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-red-500">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">סיסמה</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                    <Input id="password" type={showPassword ? "text" : "password"}
                      placeholder="••••••••" className="pr-10 pl-10"
                      autoComplete="current-password" dir="ltr"
                      {...loginForm.register("password")} />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b]">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-red-500">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={() => setMode("forgot")}
                    className="text-sm text-[#16a34a] hover:underline">
                    שכחתי סיסמה
                  </button>
                </div>

                <Button type="submit" className="w-full h-10" loading={isLoading}>
                  {isLoading ? "מתחבר..." : "התחבר"}
                </Button>

                <p className="text-xs text-[#94a3b8] text-center">
                  אין לך חשבון? פני למנהל המערכת כדי שייצור לך אחד.
                </p>
              </form>
            )}

            {/* ── MFA BLOCKED ── */}
            {mode === "mfa-blocked" && (
              <div className="space-y-5 text-center">
                <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                  <ShieldOff className="h-7 w-7 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#0f172a] mb-1">אימות דו-שלבי פעיל</h2>
                  <p className="text-sm text-[#64748b]">
                    החשבון שלך מוגן באימות טלפוני (OTP).<br />
                    לחצי על הכפתור למטה להסרתו ולהתחברות ישירה במייל וסיסמה.
                  </p>
                </div>
                <Button onClick={handleRemoveMfa} loading={mfaRemoving} className="w-full h-10">
                  {mfaRemoving ? "מסיר אימות..." : "הסר אימות טלפוני והתחבר"}
                </Button>
                <button type="button" onClick={() => setMode("login")}
                  className="text-sm text-[#94a3b8] hover:text-[#64748b]">
                  חזרה
                </button>
              </div>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {mode === "forgot" && (
              <>
                <h2 className="text-xl font-semibold text-[#0f172a] mb-2 text-center">איפוס סיסמה</h2>
                <p className="text-sm text-[#64748b] text-center mb-6">
                  הכנס את כתובת המייל שלך ונשלח לך קישור לאיפוס
                </p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">כתובת מייל</Label>
                    <Input id="forgot-email" type="email" placeholder="name@company.com"
                      value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} dir="ltr" />
                  </div>
                  <Button onClick={handleForgotPassword} className="w-full h-10" loading={forgotLoading}>
                    שלח קישור לאיפוס
                  </Button>
                  <button type="button" onClick={() => setMode("login")}
                    className="w-full text-sm text-[#64748b] hover:text-[#0f172a]">
                    חזרה להתחברות
                  </button>
                </div>
              </>
            )}

          </div>
        </div>

        <p className="text-center text-xs text-[#94a3b8] mt-6">
          מערכת CRM &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
