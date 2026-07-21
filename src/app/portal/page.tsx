"use client";

import { useState, useEffect } from "react";
import { FolderOpen, CheckSquare, Clock, TrendingUp, Building2, MessageSquare, FileText, AlertCircle } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, getStatusLabel, getStatusColor } from "@/lib/utils";
import { authHeader } from "@/lib/supabase/client";

export default function PortalPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "client") { router.push("/dashboard"); return; }
    authHeader().then(h => fetch(`/api/portal?user_id=${user.id}`, { headers: h }))
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return (
    <div>
      <Header title="הפורטל שלי" />
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    </div>
  );

  if (!data?.customer) return (
    <div>
      <Header title="הפורטל שלי" />
      <div className="p-12 text-center text-[#94a3b8]">
        <AlertCircle className="h-16 w-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium mb-2">הפרופיל שלך טרם קושר ללקוח</p>
        <p className="text-sm">פנה למנהל המערכת לקישור חשבונך ללקוח.</p>
      </div>
    </div>
  );

  const { customer, projects, tasks } = data;
  const openTasks      = tasks.filter((t: any) => !["completed","cancelled"].includes(t.status));
  const completedTasks = tasks.filter((t: any) => t.status === "completed");
  const overdueTasks   = openTasks.filter((t: any) =>
    t.due_date && new Date(t.due_date) < new Date()
  );

  const overallProgress = projects.length
    ? Math.round(projects.reduce((s: number, p: any) => s + (p.progress || 0), 0) / projects.length)
    : 0;

  return (
    <div>
      <Header title={`ברוך הבא, ${user?.full_name}`} />
      <div className="p-6 space-y-6">

        {/* Customer card */}
        <Card className="bg-gradient-to-l from-[#f0fdf4] to-white border-[#bbf7d0]">
          <CardContent className="p-5 flex items-center gap-5">
            {customer.logo_url ? (
              <img src={customer.logo_url} alt={customer.company_name} className="w-16 h-16 rounded-xl object-contain border border-[#e2e8f0]" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#16a34a] flex items-center justify-center text-white text-2xl font-bold">
                {customer.company_name.charAt(0)}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-[#0f172a]">{customer.company_name}</h2>
              {customer.contact_name && <p className="text-sm text-[#64748b]">{customer.contact_name}</p>}
              {customer.email && <p className="text-sm text-[#94a3b8]">{customer.email}</p>}
            </div>
            <div className="mr-auto text-center">
              <div className="text-3xl font-bold text-[#16a34a]">{overallProgress}%</div>
              <div className="text-xs text-[#64748b]">התקדמות כוללת</div>
              <Progress value={overallProgress} className="h-2 w-24 mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label:"פרויקטים פעילים", value: projects.filter((p: any) => p.status === "active").length, icon:<FolderOpen className="h-5 w-5" />, color:"text-blue-600" },
            { label:"משימות פתוחות",   value: openTasks.length,      icon:<CheckSquare className="h-5 w-5" />, color:"text-orange-500" },
            { label:"הושלמו",          value: completedTasks.length,  icon:<TrendingUp  className="h-5 w-5" />, color:"text-green-600" },
            { label:"באיחור",          value: overdueTasks.length,    icon:<Clock       className="h-5 w-5" />, color:"text-red-500" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2.5 rounded-lg bg-[#f8fafc]", s.color)}>{s.icon}</div>
                <div>
                  <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                  <p className="text-xs text-[#64748b]">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Projects */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#0f172a] flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-blue-500" /> פרויקטים
                </h3>
              </div>
              {projects.length === 0 ? (
                <p className="text-sm text-[#94a3b8] text-center py-6">אין פרויקטים</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((p: any) => (
                    <div key={p.id} className="p-3.5 rounded-xl border border-[#f1f5f9] hover:border-[#e2e8f0]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-[#0f172a] text-sm">{p.name}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", getStatusColor(p.status))}>
                          {getStatusLabel(p.status)}
                        </span>
                      </div>
                      {p.description && <p className="text-xs text-[#64748b] mb-2">{p.description}</p>}
                      <div className="flex items-center gap-2">
                        <Progress value={p.progress} className="flex-1 h-2" />
                        <span className="text-xs font-semibold text-[#16a34a] w-10 text-left">{p.progress}%</span>
                      </div>
                      <p className="text-xs text-[#94a3b8] mt-1">{p.completed_tasks}/{p.tasks_count} משימות הושלמו</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent tasks */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#0f172a] flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-orange-500" /> משימות אחרונות
                </h3>
                <Link href="/portal/tasks" className="text-xs text-[#16a34a] hover:underline">הכל</Link>
              </div>
              {tasks.length === 0 ? (
                <p className="text-sm text-[#94a3b8] text-center py-6">אין משימות</p>
              ) : (
                <div className="space-y-2">
                  {tasks.slice(0, 6).map((t: any) => {
                    const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed";
                    return (
                      <div key={t.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-[#f8fafc] hover:border-[#e2e8f0]">
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1.5 shrink-0",
                          t.status === "completed" ? "bg-green-400" : isOverdue ? "bg-red-400" : "bg-orange-400"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium", t.status === "completed" && "line-through text-[#94a3b8]")}>
                            {t.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {t.project && <span className="text-xs text-[#94a3b8]">{t.project.name}</span>}
                            {t.due_date && (
                              <span className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-[#94a3b8]")}>
                                {new Date(t.due_date).toLocaleDateString("he-IL")}
                                {isOverdue && " (איחור!)"}
                              </span>
                            )}
                          </div>
                          {t.subtasks_count > 0 && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Progress value={t.progress} className="w-16 h-1" />
                              <span className="text-xs text-[#94a3b8]">{t.completed_subtasks}/{t.subtasks_count}</span>
                            </div>
                          )}
                        </div>
                        <Badge variant={t.status === "completed" ? "success" : "secondary"} className="text-[10px] shrink-0">
                          {getStatusLabel(t.status)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { href:"/portal/tasks",     icon:<CheckSquare className="h-6 w-6" />, label:"כל המשימות",  color:"bg-orange-50 text-orange-600 border-orange-200" },
            { href:"/chat",             icon:<MessageSquare className="h-6 w-6"/>, label:"צ'אט",         color:"bg-blue-50 text-blue-600 border-blue-200" },
            { href:"/portal/documents", icon:<FileText className="h-6 w-6" />,    label:"מסמכים",       color:"bg-purple-50 text-purple-600 border-purple-200" },
          ].map(({ href, icon, label, color }) => (
            <Link key={href} href={href}>
              <Card className={cn("border cursor-pointer hover:shadow-md transition-shadow", color)}>
                <CardContent className="p-4 flex items-center gap-3">
                  {icon}
                  <span className="font-semibold text-sm">{label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
