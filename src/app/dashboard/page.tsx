"use client";

import { useEffect, useState } from "react";
import { Timer, CheckSquare, AlertCircle, TrendingUp, Clock, Building2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { formatHours } from "@/lib/utils";
import Link from "next/link";

interface Stats {
  open_tasks: number;
  overdue_tasks: number;
  today_hours: number;
  active_clients: number;
  completed_today: number;
  total_clients: number;
  efficiency?: number;
  month_timer_hours?: number;
  month_attendance_hours?: number;
}

interface EmployeeEfficiency {
  user_id: string;
  full_name: string;
  timer_hours: number;
  attendance_hours: number;
  efficiency: number;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats>({
    open_tasks: 0,
    overdue_tasks: 0,
    today_hours: 0,
    active_clients: 0,
    completed_today: 0,
    total_clients: 0,
  });
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [employeeEfficiency, setEmployeeEfficiency] = useState<EmployeeEfficiency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

      const [tasksRes, clientsRes, timeRes, monthTimerRes, attendanceRes, usersRes] = await Promise.all([
        supabase.from("tasks").select("id, status, due_date, title, priority, customer:customers(company_name)")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase.from("customers").select("id, status"),
        supabase.from("time_entries")
          .select("duration")
          .gte("start_time", today + "T00:00:00")
          .lte("start_time", today + "T23:59:59"),
        supabase.from("time_entries")
          .select("user_id, duration")
          .gte("start_time", monthStart + "T00:00:00"),
        supabase.from("attendance")
          .select("user_id, total_hours")
          .gte("check_in", monthStart + "T00:00:00"),
        supabase.from("users").select("id, full_name").in("role", ["admin","employee"]).eq("status", "active"),
      ]);

      const tasks = tasksRes.data || [];
      const clients = clientsRes.data || [];
      const timeEntries = timeRes.data || [];
      const monthTimers = monthTimerRes.data || [];
      const attendances = attendanceRes.data || [];
      const employees = usersRes.data || [];

      const openTasks = tasks.filter(t => !["completed", "cancelled"].includes(t.status)).length;
      const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed").length;
      const completedToday = tasks.filter(t => t.status === "completed").length;
      const todaySeconds = timeEntries.reduce((sum, e) => sum + (e.duration || 0), 0);

      // Efficiency: timer_hours / attendance_hours * 100 per employee
      const efficiencyMap: Record<string, { timer: number; attendance: number; name: string }> = {};
      employees.forEach(e => { efficiencyMap[e.id] = { timer: 0, attendance: 0, name: e.full_name }; });
      monthTimers.forEach((t: any) => {
        if (efficiencyMap[t.user_id]) efficiencyMap[t.user_id].timer += (t.duration || 0);
      });
      attendances.forEach((a: any) => {
        // total_hours is stored in seconds (see attendance checkout)
        if (efficiencyMap[a.user_id]) efficiencyMap[a.user_id].attendance += (a.total_hours || 0);
      });

      const efficiencies: EmployeeEfficiency[] = Object.entries(efficiencyMap)
        .filter(([, v]) => v.attendance > 0 || v.timer > 0)
        .map(([uid, v]) => ({
          user_id: uid,
          full_name: v.name,
          timer_hours: v.timer / 3600,
          attendance_hours: v.attendance / 3600,
          efficiency: v.attendance > 0 ? Math.round((v.timer / v.attendance) * 100) : 0,
        }))
        .sort((a, b) => b.efficiency - a.efficiency);

      setEmployeeEfficiency(efficiencies);

      const totalTimerHours = monthTimers.reduce((s: number, e: any) => s + (e.duration || 0), 0) / 3600;
      const totalAttendanceSeconds = attendances.reduce((s: number, a: any) => s + (a.total_hours || 0), 0);
      const totalAttendanceHours = totalAttendanceSeconds / 3600;
      const overallEfficiency = totalAttendanceHours > 0
        ? Math.round((totalTimerHours / totalAttendanceHours) * 100)
        : 0;

      setStats({
        open_tasks: openTasks,
        overdue_tasks: overdue,
        today_hours: todaySeconds,
        active_clients: clients.filter(c => c.status === "active").length,
        completed_today: completedToday,
        total_clients: clients.length,
        efficiency: overallEfficiency,
        month_timer_hours: totalTimerHours,
        month_attendance_hours: totalAttendanceHours,
      });

      setRecentTasks(tasks.slice(0, 5));
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, gradient, iconColor, sub, accent }: {
    title: string; value: string | number; icon: any;
    gradient: string; iconColor: string; sub?: string; accent?: string;
  }) => (
    <div className={`relative overflow-hidden rounded-2xl p-5 shadow-sm border border-white/60 ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{title}</p>
          <p className="text-3xl font-bold text-[#0f172a] mt-2 leading-none">{value}</p>
          {sub && <p className="text-xs text-[#94a3b8] mt-1.5">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {accent && (
        <div className={`absolute bottom-0 right-0 w-24 h-24 rounded-full opacity-10 -mb-10 -mr-6 ${accent}`} />
      )}
    </div>
  );

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      new: "חדש", in_progress: "בטיפול", pending: "ממתין",
      completed: "הושלם", cancelled: "בוטל",
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      new: "bg-blue-100 text-blue-700",
      in_progress: "bg-purple-100 text-purple-700",
      pending: "bg-yellow-100 text-yellow-700",
      completed: "bg-green-100 text-green-700",
      cancelled: "bg-gray-100 text-gray-700",
    };
    return map[status] || "bg-gray-100 text-gray-700";
  };

  const getPriorityColor = (p: string) => {
    return p === "high" ? "text-red-500" : p === "medium" ? "text-yellow-500" : "text-green-500";
  };

  if (loading) {
    return (
      <div>
        <Header title="דשבורד" />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
          </div>
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={`שלום, ${user?.full_name?.split(" ")[0]} 👋`} />
      <div className="p-6 space-y-5">

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="לקוחות פעילים"
          value={stats.active_clients}
          icon={Building2}
          gradient="bg-gradient-to-br from-blue-50 to-indigo-50"
          iconColor="bg-blue-100 text-blue-600"
          sub={`מתוך ${stats.total_clients} סה"כ`}
          accent="bg-blue-400"
        />
        <StatCard
          title="משימות פתוחות"
          value={stats.open_tasks}
          icon={CheckSquare}
          gradient="bg-gradient-to-br from-violet-50 to-purple-50"
          iconColor="bg-violet-100 text-violet-600"
          accent="bg-violet-400"
        />
        <StatCard
          title="משימות באיחור"
          value={stats.overdue_tasks}
          icon={AlertCircle}
          gradient={stats.overdue_tasks > 0 ? "bg-gradient-to-br from-red-50 to-rose-50" : "bg-gradient-to-br from-green-50 to-emerald-50"}
          iconColor={stats.overdue_tasks > 0 ? "bg-red-100 text-red-500" : "bg-green-100 text-green-600"}
          accent={stats.overdue_tasks > 0 ? "bg-red-400" : "bg-green-400"}
        />
        <StatCard
          title="שעות היום"
          value={formatHours(stats.today_hours)}
          icon={Clock}
          gradient="bg-gradient-to-br from-emerald-50 to-green-50"
          iconColor="bg-emerald-100 text-emerald-600"
          accent="bg-emerald-400"
        />
      </div>

      {/* Efficiency metric — admin only */}
      {user?.role === "admin" && employeeEfficiency.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" /> יעילות עובדים — החודש
            </CardTitle>
            <div className="text-sm text-[#64748b]">
              יעילות כוללת:
              <span className={`mr-1 font-bold ${(stats.efficiency || 0) >= 80 ? "text-green-600" : (stats.efficiency || 0) >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                {stats.efficiency || 0}%
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {employeeEfficiency.slice(0, 5).map(emp => (
                <div key={emp.user_id} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center text-xs font-bold text-[#64748b] shrink-0">
                    {emp.full_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-[#0f172a] truncate">{emp.full_name}</p>
                      <span className={`text-sm font-bold ml-2 shrink-0 ${emp.efficiency >= 80 ? "text-green-600" : emp.efficiency >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                        {emp.efficiency}%
                      </span>
                    </div>
                    <div className="w-full bg-[#f1f5f9] rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${emp.efficiency >= 80 ? "bg-green-500" : emp.efficiency >= 50 ? "bg-yellow-400" : "bg-red-400"}`}
                        style={{ width: `${Math.min(100, emp.efficiency)}%` }}
                      />
                    </div>
                    <p className="text-xs text-[#94a3b8] mt-0.5">
                      {emp.timer_hours.toFixed(1)}h טיימר / {emp.attendance_hours.toFixed(1)}h נוכחות
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Tasks */}
      <div className="grid grid-cols-1 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
            <h3 className="font-semibold text-[#0f172a] flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-[#16a34a]" /> משימות אחרונות
            </h3>
            <Link href="/tasks" className="text-xs text-[#16a34a] hover:underline font-medium">הצג הכל ←</Link>
          </div>
          {recentTasks.length === 0 ? (
            <div className="text-center py-12 text-[#94a3b8]">
              <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">אין משימות להצגה</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f8fafc]">
              {recentTasks.map((task) => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed";
                return (
                  <Link key={task.id} href={`/tasks/${task.id}`}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8fafc] transition-colors group">
                      <div className={`w-1.5 h-8 rounded-full shrink-0 ${
                        task.priority === "high" ? "bg-red-400" :
                        task.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#0f172a] text-sm truncate group-hover:text-[#16a34a] transition-colors">{task.title}</p>
                        <p className="text-xs text-[#94a3b8] mt-0.5">{task.customer?.company_name || "ללא לקוח"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${getStatusColor(task.status)}`}>
                          {getStatusLabel(task.status)}
                        </span>
                        {task.due_date && (
                          <span className={`text-[11px] font-medium ${isOverdue ? "text-red-500" : "text-[#94a3b8]"}`}>
                            {new Date(task.due_date).toLocaleDateString("he-IL")}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      </div>
    </div>
  );
}
