"use client";

import { useState, useEffect } from "react";
import { Save, Plus, Edit, Trash2, User, Shield, Timer, MessageSquare, Bell, Send } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase, authHeader } from "@/lib/supabase/client";
import { User as UserType } from "@/types";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import UserFormDialog from "@/components/settings/UserFormDialog";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<UserType[]>([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editUser, setEditUser] = useState<UserType | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);

  useEffect(() => {
    loadUsers();
    loadSettings();
  }, []);

  const loadUsers = async () => {
    const res = await fetch("/api/users", { headers: await authHeader() });
    const json = await res.json();
    setUsers(json.data || []);
  };

  const loadSettings = async () => {
    const { data } = await supabase.from("system_settings").select("*").limit(1).single();
    if (data) setSettings(data);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const { error } = await supabase.from("system_settings").update({
        business_name: settings.business_name,
        timer_edit_mode: settings.timer_edit_mode,
        timer_edit_days: settings.timer_edit_days,
        task_auto_complete: settings.task_auto_complete,
        task_delete_approval: settings.task_delete_approval,
        chat_require_approval: settings.chat_require_approval,
        hours_alert_percentage: settings.hours_alert_percentage,
      }).eq("id", settings.id);
      if (error) throw error;
      toast.success("ההגדרות נשמרו");
    } catch { toast.error("שגיאה בשמירה"); }
    finally { setSavingSettings(false); }
  };

  const handleToggleUser = async (u: UserType) => {
    const newStatus = u.status === "active" ? "inactive" : "active";
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ id: u.id, full_name: u.full_name, role: u.role, phone: u.phone, status: newStatus }),
    });
    if (!res.ok) toast.error("שגיאה בעדכון");
    else { toast.success("המשתמש עודכן"); loadUsers(); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("למחוק משתמש זה?")) return;
    const res = await fetch(`/api/users?id=${id}`, { method: "DELETE", headers: await authHeader() });
    if (!res.ok) toast.error("שגיאה");
    else { toast.success("המשתמש הושבת"); loadUsers(); }
  };

  const handleHardDeleteUser = async (u: UserType) => {
    if (!confirm(`למחוק את ${u.full_name} לצמיתות? לא ניתן לשחזר, וכל רישומי הזמן שלו יימחקו איתו.`)) return;
    const res = await fetch(`/api/users?id=${u.id}&hard=true`, { method: "DELETE", headers: await authHeader() });
    if (!res.ok) { const j = await res.json(); toast.error(j.error || "שגיאה במחיקה"); }
    else { toast.success("המשתמש נמחק לצמיתות"); loadUsers(); }
  };

  const handleTestEmail = async () => {
    if (!user?.email) return;
    setTestEmailLoading(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          to: user.email,
          subject: "בדיקת מייל — מערכת CRM",
          html: `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px;"><h2 style="color:#16a34a;">מייל בדיקה</h2><p>המייל נשלח בהצלחה ממערכת ה-CRM!</p><p style="color:#64748b;font-size:13px;">נשלח אל: ${user.email}</p></div>`,
        }),
      });
      const j = await res.json();
      if (!res.ok) toast.error(j.error || "שגיאה בשליחה");
      else toast.success(`מייל בדיקה נשלח ל-${user.email}`);
    } catch { toast.error("שגיאה בשליחה"); }
    finally { setTestEmailLoading(false); }
  };

  const handleSendInvite = async (u: UserType) => {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ send_invite: true, email: u.email }),
    });
    if (!res.ok) {
      const j = await res.json();
      toast.error(j.error || "שגיאה בשליחת ההזמנה");
    } else {
      toast.success(`מייל הזמנה נשלח ל-${u.email}`);
    }
  };

  const getRoleBadge = (role: string) => {
    const map: Record<string, { label: string; variant: any }> = {
      admin: { label: "מנהל מערכת", variant: "default" },
      employee: { label: "עובד", variant: "secondary" },
      client: { label: "לקוח", variant: "outline" },
    };
    return map[role] || { label: role, variant: "ghost" };
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-8 text-center text-[#94a3b8]">
        <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p>גישה לדף זה מוגבלת למנהלים בלבד</p>
      </div>
    );
  }

  return (
    <div>
      <Header title="הגדרות מערכת" />
      <div className="p-6">
        <Tabs defaultValue="users">
          <TabsList className="mb-5">
            <TabsTrigger value="users"><User className="h-4 w-4 ml-1" />משתמשים</TabsTrigger>
            <TabsTrigger value="general">כלליות</TabsTrigger>
            <TabsTrigger value="timers"><Timer className="h-4 w-4 ml-1" />טיימרים</TabsTrigger>
            <TabsTrigger value="tasks">משימות</TabsTrigger>
            <TabsTrigger value="chat"><MessageSquare className="h-4 w-4 ml-1" />צ'אט</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>ניהול משתמשים</CardTitle>
                <Button onClick={() => { setEditUser(null); setShowUserForm(true); }}>
                  <Plus className="h-4 w-4" /> הוסף משתמש
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-[#f1f5f9]">
                  {users.map(u => {
                    const role = getRoleBadge(u.role);
                    return (
                      <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="w-9 h-9 bg-[#16a34a] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {u.full_name?.charAt(0) || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[#0f172a]">{u.full_name}</p>
                          <p className="text-sm text-[#64748b]">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={role.variant}>{role.label}</Badge>
                          <Badge variant={u.status === "active" ? "success" : "ghost"}>
                            {u.status === "active" ? "פעיל" : "לא פעיל"}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleSendInvite(u)} title="שלח הזמנה במייל"
                            className="p-1.5 rounded-md hover:bg-blue-50 text-blue-400">
                            <Send className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setEditUser(u); setShowUserForm(true); }} className="p-1.5 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleToggleUser(u)} className={`p-1.5 rounded-md hover:bg-[#f1f5f9] ${u.status === "active" ? "text-yellow-500" : "text-green-500"}`}>
                            <Shield className="h-4 w-4" />
                          </button>
                          {u.id !== user?.id && u.status === "active" && (
                            <button onClick={() => handleDeleteUser(u.id)} title="השבת" className="p-1.5 rounded-md hover:bg-red-50 text-red-400">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                          {u.id !== user?.id && u.status === "inactive" && (
                            <button onClick={() => handleHardDeleteUser(u)} title="מחק לצמיתות" className="p-1.5 rounded-md hover:bg-red-100 text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>הגדרות כלליות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>שם העסק</Label>
                  <Input value={settings.business_name || ""} onChange={e => setSettings((p: any) => ({ ...p, business_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>אחוז התראה לחבילת שעות (%)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={settings.hours_alert_percentage || 80}
                    onChange={e => setSettings((p: any) => ({ ...p, hours_alert_percentage: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-[#64748b]">התראה כאשר לקוח מגיע לאחוז זה מחבילת השעות שלו</p>
                </div>
                <Button onClick={handleSaveSettings} loading={savingSettings}>
                  <Save className="h-4 w-4" /> שמור
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>בדיקת שליחת מייל</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-[#64748b]">
                  לחצי לשליחת מייל בדיקה לכתובת <span className="font-medium text-[#0f172a]">{user?.email}</span> — כך תוכלי לוודא שהמייל יוצא כהלכה.
                </p>
                <Button variant="outline" onClick={handleTestEmail} loading={testEmailLoading}>
                  <Send className="h-4 w-4" /> שלח מייל בדיקה
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timers Tab */}
          <TabsContent value="timers">
            <Card>
              <CardHeader><CardTitle>הגדרות טיימרים</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>הרשאות עריכת טיימרים לעובדים</Label>
                  <Select value={settings.timer_edit_mode || "free"} onValueChange={v => setSettings((p: any) => ({ ...p, timer_edit_mode: v }))}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ללא עריכה</SelectItem>
                      <SelectItem value="free">עריכה חופשית</SelectItem>
                      <SelectItem value="days">עריכה עד X ימים</SelectItem>
                      <SelectItem value="approval">עריכה באישור מנהל</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {settings.timer_edit_mode === "days" && (
                  <div className="space-y-1.5">
                    <Label>מספר ימים לעריכה</Label>
                    <Input
                      type="number" min={1}
                      value={settings.timer_edit_days || 7}
                      onChange={e => setSettings((p: any) => ({ ...p, timer_edit_days: Number(e.target.value) }))}
                      className="w-24"
                    />
                  </div>
                )}
                <Button onClick={handleSaveSettings} loading={savingSettings}>
                  <Save className="h-4 w-4" /> שמור
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader><CardTitle>הגדרות משימות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.task_auto_complete || false}
                    onChange={e => setSettings((p: any) => ({ ...p, task_auto_complete: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <div>
                    <p className="text-sm font-medium">השלמה אוטומטית</p>
                    <p className="text-xs text-[#64748b]">כאשר כל תתי המשימות הושלמו, סמן משימה כהושלמה אוטומטית</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.task_delete_approval || true}
                    onChange={e => setSettings((p: any) => ({ ...p, task_delete_approval: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <div>
                    <p className="text-sm font-medium">אישור מחיקת משימות</p>
                    <p className="text-xs text-[#64748b]">עובד צריך אישור מנהל למחיקת משימה</p>
                  </div>
                </label>
                <Button onClick={handleSaveSettings} loading={savingSettings}>
                  <Save className="h-4 w-4" /> שמור
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Chat Tab */}
          <TabsContent value="chat">
            <Card>
              <CardHeader><CardTitle>הגדרות צ'אט</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.chat_require_approval || true}
                    onChange={e => setSettings((p: any) => ({ ...p, chat_require_approval: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <div>
                    <p className="text-sm font-medium">אישור פתיחת שיחה בין עובדים</p>
                    <p className="text-xs text-[#64748b]">שיחה בין עובד לעובד דורשת אישור מנהל</p>
                  </div>
                </label>
                <Button onClick={handleSaveSettings} loading={savingSettings}>
                  <Save className="h-4 w-4" /> שמור
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showUserForm && (
        <UserFormDialog
          user={editUser}
          onClose={() => { setShowUserForm(false); setEditUser(null); }}
          onSave={loadUsers}
        />
      )}
    </div>
  );
}
