"use client";

import { useState, useEffect } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { Attendance, User as UserType } from "@/types";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { formatDateTime, formatTime, formatHours } from "@/lib/utils";

export default function AttendancePage() {
  const { user } = useAuthStore();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [activeAttendance, setActiveAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState("me");
  const [employees, setEmployees] = useState<UserType[]>([]);
  const [clockLoading, setClockLoading] = useState(false);

  useEffect(() => { loadData(); }, [filterEmployee, user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      // Check active attendance (clock-in without clock-out)
      const { data: active } = await supabase.from("attendance")
        .select("*")
        .eq("user_id", user.id)
        .is("check_out", null)
        .order("check_in", { ascending: false })
        .limit(1);
      setActiveAttendance(active?.[0] || null);

      // Load history
      let query = supabase.from("attendance")
        .select("*, user:users(full_name)")
        .order("check_in", { ascending: false })
        .limit(30);

      if (user.role === "employee" || filterEmployee === "me") {
        query = query.eq("user_id", user.id);
      }

      const { data } = await query;
      setAttendance(data || []);

      // Load employees for admin
      if (user.role === "admin") {
        const { data: emps } = await supabase.from("users").select("*").eq("role", "employee").eq("status", "active");
        setEmployees((emps || []) as UserType[]);
      }
    } catch { toast.error("שגיאה בטעינה"); }
    finally { setLoading(false); }
  };

  const handleClockIn = async () => {
    if (!user) return;
    setClockLoading(true);
    try {
      const { error } = await supabase.from("attendance").insert({
        user_id: user.id,
        check_in: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("כניסה נרשמה");
      loadData();
    } catch { toast.error("שגיאה בכניסה"); }
    finally { setClockLoading(false); }
  };

  const handleClockOut = async () => {
    if (!activeAttendance) return;
    setClockLoading(true);
    try {
      const checkOut = new Date();
      const checkIn = new Date(activeAttendance.check_in);
      const totalSeconds = Math.round((checkOut.getTime() - checkIn.getTime()) / 1000);

      const { error } = await supabase.from("attendance").update({
        check_out: checkOut.toISOString(),
        total_hours: totalSeconds,
      }).eq("id", activeAttendance.id);

      if (error) throw error;
      toast.success("יציאה נרשמה");
      loadData();
    } catch { toast.error("שגיאה ביציאה"); }
    finally { setClockLoading(false); }
  };

  const todayAttendance = attendance.filter(a => {
    const date = new Date(a.check_in).toLocaleDateString("he-IL");
    return date === new Date().toLocaleDateString("he-IL");
  });

  const todayTotal = todayAttendance.reduce((sum, a) => sum + (a.total_hours || 0), 0);

  return (
    <div>
      <Header title="נוכחות" />
      <div className="p-6 space-y-5">
        {/* Clock in/out */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-2xl border p-5 flex items-center gap-4 shadow-sm transition-all ${
            activeAttendance
              ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-100"
              : "bg-white border-[#e2e8f0]"
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${
              activeAttendance ? "bg-green-100" : "bg-[#f1f5f9]"
            }`}>
              <Clock className={`h-7 w-7 ${activeAttendance ? "text-green-600" : "text-[#94a3b8]"}`} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#64748b] font-medium">מצב נוכחות</p>
              <p className={`font-bold text-base mt-0.5 ${activeAttendance ? "text-green-700" : "text-[#374151]"}`}>
                {activeAttendance ? `נוכח מ-${formatTime(activeAttendance.check_in)}` : "לא נוכח"}
              </p>
              {activeAttendance && (
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-600">פעיל עכשיו</span>
                </div>
              )}
            </div>
            {activeAttendance ? (
              <Button onClick={handleClockOut} loading={clockLoading} variant="destructive" size="sm">
                <LogOut className="h-4 w-4" /> יציאה
              </Button>
            ) : (
              <Button onClick={handleClockIn} loading={clockLoading} size="sm">
                <LogIn className="h-4 w-4" /> כניסה
              </Button>
            )}
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5 shadow-sm">
            <p className="text-xs font-medium text-[#64748b]">שעות היום</p>
            <p className="text-4xl font-bold text-blue-700 mt-1 leading-none">{formatHours(todayTotal)}</p>
            <p className="text-xs text-[#94a3b8] mt-2">{todayAttendance.length} רשומות היום</p>
          </div>
        </div>

        {/* Filters */}
        {user?.role === "admin" && (
          <div className="flex items-center gap-3">
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">הנוכחות שלי</SelectItem>
                <SelectItem value="all">כל העובדים</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* History */}
        <Card>
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-[#f1f5f9]">
              <h2 className="font-semibold text-[#0f172a]">היסטוריית נוכחות</h2>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}
              </div>
            ) : attendance.length === 0 ? (
              <div className="text-center py-10 text-[#94a3b8]">
                <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>אין נוכחות להצגה</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f1f5f9]">
                {attendance.map(record => (
                  <div key={record.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#0f172a]">
                        {record.user?.full_name || user?.full_name}
                      </p>
                      <p className="text-xs text-[#64748b]">
                        {new Date(record.check_in).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                    </div>
                    <div className="text-xs text-[#64748b] text-left" dir="ltr">
                      <span>{formatTime(record.check_in)}</span>
                      {record.check_out && <span> – {formatTime(record.check_out)}</span>}
                      {!record.check_out && <span className="text-green-600"> (פעיל)</span>}
                    </div>
                    <span className="font-mono text-sm font-medium text-[#374151] w-16 text-left" dir="ltr">
                      {record.total_hours ? formatHours(record.total_hours) : "–"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
