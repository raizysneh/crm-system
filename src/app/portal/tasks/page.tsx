"use client";

import { useState, useEffect } from "react";
import { CheckSquare } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { cn, getStatusLabel } from "@/lib/utils";
import { authHeader } from "@/lib/supabase/client";

export default function PortalTasksPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [tasks, setTasks]         = useState<any[]>([]);
  const [projects, setProjects]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterProject, setFilterProject] = useState("all");

  useEffect(() => {
    if (!user) return;
    if (user.role !== "client") { router.push("/dashboard"); return; }
    authHeader().then(h => fetch(`/api/portal?user_id=${user.id}`, { headers: h }))
      .then(r => r.json())
      .then(d => { setTasks(d.tasks || []); setProjects(d.projects || []); })
      .finally(() => setLoading(false));
  }, [user]);

  // The portal API already scopes tasks to completed-only for clients.
  const filtered = tasks.filter(t => {
    if (filterProject !== "all" && t.project_id !== filterProject) return false;
    return true;
  });

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
        <div className="grid grid-cols-1 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{tasks.length}</p>
              <p className="text-xs text-[#64748b]">משימות שהושלמו</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
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
            {filtered.map((t: any) => (
              <Card key={t.id}>
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-green-100">
                    <CheckSquare className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-[#0f172a] line-through text-[#94a3b8]">{t.title}</p>
                      <Badge variant="success" className="shrink-0 text-xs">{getStatusLabel(t.status)}</Badge>
                    </div>
                    {t.description && <p className="text-sm text-[#64748b] mt-0.5 line-clamp-2">{t.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {t.project && <span className="text-xs text-[#64748b]">{t.project.name}</span>}
                      {t.assigned_user && <span className="text-xs text-[#94a3b8]">אחראי: {t.assigned_user.full_name}</span>}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
