"use client";

import { useState, useEffect } from "react";
import { CheckSquare, Clock, AlertCircle } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { cn, getStatusLabel, getStatusColor } from "@/lib/utils";

export default function PortalTasksPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [tasks, setTasks]         = useState<any[]>([]);
  const [projects, setProjects]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterProject, setFilterProject] = useState("all");

  useEffect(() => {
    if (!user) return;
    if (user.role !== "client") { router.push("/dashboard"); return; }
    fetch(`/api/portal?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => { setTasks(d.tasks || []); setProjects(d.projects || []); })
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = tasks.filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterProject !== "all" && t.project_id !== filterProject) return false;
    return true;
  });

  const stats = {
    open:      tasks.filter(t => !["completed","cancelled"].includes(t.status)).length,
    completed: tasks.filter(t => t.status === "completed").length,
    overdue:   tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed").length,
  };

  if (loading) return (
    <div>
      <Header title="המשימות שלי" />
      <div className="p-6 space-y-3">
        {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div>
      <Header title="המשימות שלי" />
      <div className="p-6 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:"פתוחות", value:stats.open,      color:"text-orange-500" },
            { label:"הושלמו", value:stats.completed,  color:"text-green-600" },
            { label:"באיחור", value:stats.overdue,    color:"text-red-500"   },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-[#64748b]">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="סטטוס" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="new">חדש</SelectItem>
              <SelectItem value="in_progress">בטיפול</SelectItem>
              <SelectItem value="pending">ממתין</SelectItem>
              <SelectItem value="completed">הושלם</SelectItem>
            </SelectContent>
          </Select>
          {projects.length > 0 && (
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-48"><SelectValue placeholder="פרויקט" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הפרויקטים</SelectItem>
                {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Tasks */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-[#94a3b8]">
              <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>אין משימות להצגה</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((t: any) => {
              const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed";
              return (
                <Card key={t.id} className={cn(isOverdue && "border-red-200")}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      t.status === "completed" ? "bg-green-100" : isOverdue ? "bg-red-100" : "bg-orange-100"
                    )}>
                      {isOverdue
                        ? <AlertCircle className="h-5 w-5 text-red-500" />
                        : t.status === "completed"
                          ? <CheckSquare className="h-5 w-5 text-green-500" />
                          : <Clock className="h-5 w-5 text-orange-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "font-semibold text-[#0f172a]",
                          t.status === "completed" && "line-through text-[#94a3b8]"
                        )}>
                          {t.title}
                        </p>
                        <Badge variant={t.priority === "high" ? "destructive" : t.priority === "medium" ? "warning" : "success"} className="shrink-0 text-xs">
                          {t.priority === "high" ? "גבוהה" : t.priority === "medium" ? "בינונית" : "נמוכה"}
                        </Badge>
                      </div>
                      {t.description && <p className="text-sm text-[#64748b] mt-0.5 line-clamp-2">{t.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", getStatusColor(t.status))}>
                          {getStatusLabel(t.status)}
                        </span>
                        {t.project && <span className="text-xs text-[#64748b]">{t.project.name}</span>}
                        {t.assigned_user && <span className="text-xs text-[#94a3b8]">אחראי: {t.assigned_user.full_name}</span>}
                        {t.due_date && (
                          <span className={cn("text-xs flex items-center gap-1", isOverdue ? "text-red-500 font-semibold" : "text-[#94a3b8]")}>
                            <Clock className="h-3 w-3" />
                            {new Date(t.due_date).toLocaleDateString("he-IL")}
                            {isOverdue && " (איחור!)"}
                          </span>
                        )}
                      </div>
                      {t.subtasks_count > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <Progress value={t.progress} className="flex-1 h-1.5" />
                          <span className="text-xs text-[#94a3b8]">{t.completed_subtasks}/{t.subtasks_count}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
