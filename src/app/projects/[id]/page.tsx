"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Edit } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase/client";
import { Project, Task, Customer } from "@/types";
import { toast } from "sonner";
import { getStatusLabel, getStatusColor, formatHours } from "@/lib/utils";
import Link from "next/link";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";
import TaskCard from "@/components/tasks/TaskCard";

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectRes, tasksRes, clientsRes] = await Promise.all([
        supabase.from("projects").select("*, customer:customers(id, company_name)").eq("id", id).single(),
        supabase.from("tasks").select(`
          *,
          customer:customers(id, company_name),
          project:projects(id, name),
          assigned_user:users(id, full_name),
          subtasks(id, completed)
        `).eq("project_id", id).order("created_at", { ascending: false }),
        supabase.from("customers").select("id, company_name").eq("status", "active"),
      ]);

      if (projectRes.error) throw projectRes.error;
      const tasksWithProgress = (tasksRes.data || []).map(task => ({
        ...task,
        subtasks_count: task.subtasks?.length || 0,
        completed_subtasks: task.subtasks?.filter((s: any) => s.completed).length || 0,
        progress: task.subtasks?.length ? Math.round((task.subtasks.filter((s: any) => s.completed).length / task.subtasks.length) * 100) : 0,
      }));
      setProject(projectRes.data);
      setTasks(tasksWithProgress);
      setClients(clientsRes.data || []);
    } catch { toast.error("שגיאה"); router.push("/projects"); }
    finally { setLoading(false); }
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (!error) setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: status as any } : t));
  };

  if (loading || !project) return <div className="p-8 animate-pulse"><div className="h-8 bg-gray-200 rounded w-48" /></div>;

  const completedTasks = tasks.filter(t => t.status === "completed").length;
  const progress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <div>
      <Header />
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/projects"><ArrowRight className="h-5 w-5 text-[#64748b]" /></Link>
          <h1 className="text-xl font-bold text-[#0f172a] flex-1">{project.name}</h1>
          <span className={`text-sm px-2.5 py-1 rounded-full font-medium ${getStatusColor(project.status)}`}>
            {getStatusLabel(project.status)}
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
            <Edit className="h-4 w-4" /> ערוך
          </Button>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex gap-5 flex-wrap">
              <div className="flex-1 space-y-3">
                <div className="flex gap-6 text-sm">
                  <div><p className="text-[#64748b]">לקוח</p>
                    <Link href={`/clients/${project.customer_id}`} className="font-medium text-[#16a34a] hover:underline">{project.customer?.company_name}</Link>
                  </div>
                  {project.start_date && <div><p className="text-[#64748b]">התחלה</p><p className="font-medium">{new Date(project.start_date).toLocaleDateString("he-IL")}</p></div>}
                  {project.due_date && <div><p className="text-[#64748b]">יעד</p><p className="font-medium">{new Date(project.due_date).toLocaleDateString("he-IL")}</p></div>}
                </div>
                {project.description && <p className="text-sm text-[#374151]">{project.description}</p>}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center min-w-[250px]">
                {[
                  { label: "משימות", value: tasks.length },
                  { label: "פתוחות", value: tasks.filter(t => !["completed", "cancelled"].includes(t.status)).length },
                  { label: "הושלמו", value: completedTasks },
                ].map(s => (
                  <div key={s.label} className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="font-bold text-[#0f172a]">{s.value}</p>
                    <p className="text-xs text-[#64748b]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-[#64748b]">התקדמות</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="font-semibold text-[#0f172a]">משימות ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-[#94a3b8]">אין משימות בפרויקט זה</div>
          ) : (
            tasks.map(task => (
              <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onRefresh={loadData} />
            ))
          )}
        </div>
      </div>

      {showEdit && (
        <ProjectFormDialog project={project} clients={clients} onClose={() => setShowEdit(false)} onSave={loadData} />
      )}
    </div>
  );
}
