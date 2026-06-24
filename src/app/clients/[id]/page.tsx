"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Edit, Phone, Mail, Clock, CheckSquare, Timer, FolderOpen, MoreVertical } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { Customer, Task, Project, TimeEntry } from "@/types";
import { toast } from "sonner";
import { formatDateTime, formatHours, getStatusLabel, getStatusColor } from "@/lib/utils";
import Link from "next/link";
import ClientFormDialog from "@/components/clients/ClientFormDialog";

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Customer | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientRes, tasksRes, projectsRes, timeRes] = await Promise.all([
        supabase.from("customers").select("*, phones:customer_phones(*)").eq("id", id).single(),
        supabase.from("tasks").select("*, assigned_user:users(full_name)").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("projects").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("time_entries").select("*, user:users(full_name)").eq("customer_id", id).order("start_time", { ascending: false }).limit(20),
      ]);

      if (clientRes.error) throw clientRes.error;
      setClient(clientRes.data);
      setTasks(tasksRes.data || []);
      setProjects(projectsRes.data || []);
      setTimeEntries(timeRes.data || []);
    } catch {
      toast.error("שגיאה בטעינת הלקוח");
      router.push("/clients");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-32 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!client) return null;

  const totalHours = timeEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
  const openTasks = tasks.filter(t => !["completed", "cancelled"].includes(t.status)).length;

  return (
    <div>
      <Header />
      <div className="p-6 space-y-5">
        {/* Back + Title */}
        <div className="flex items-center gap-3">
          <Link href="/clients" className="text-[#64748b] hover:text-[#0f172a]">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-[#0f172a]">{client.company_name}</h1>
          <Badge variant={client.status === "active" ? "success" : "ghost"}>
            {client.status === "active" ? "פעיל" : "לא פעיל"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)} className="mr-auto">
            <Edit className="h-4 w-4" /> ערוך
          </Button>
        </div>

        {/* Client Info Card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex gap-5 flex-wrap">
              {client.logo_url && (
                <img src={client.logo_url} alt={client.company_name} className="w-20 h-20 object-contain rounded-lg border border-[#e2e8f0]" />
              )}
              <div className="flex-1 space-y-2">
                {client.contact_name && <p className="text-sm"><span className="text-[#64748b]">איש קשר: </span>{client.contact_name}</p>}
                {client.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-[#64748b]" />
                    <a href={`mailto:${client.email}`} className="text-[#16a34a] hover:underline">{client.email}</a>
                  </div>
                )}
                {client.phones?.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-[#64748b]" />
                    <span dir="ltr">{p.phone}</span>
                    {p.label && <span className="text-[#94a3b8] text-xs">({p.label})</span>}
                  </div>
                ))}
                {client.notes && <p className="text-sm text-[#64748b] mt-2">{client.notes}</p>}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 min-w-[300px]">
                {[
                  { label: "משימות פתוחות", value: openTasks, icon: CheckSquare, color: "text-purple-600" },
                  { label: "פרויקטים", value: projects.length, icon: FolderOpen, color: "text-blue-600" },
                  { label: "שעות שנוצלו", value: formatHours(totalHours), icon: Timer, color: "text-green-600" },
                ].map(s => (
                  <div key={s.label} className="text-center bg-[#f8fafc] rounded-lg p-3">
                    <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                    <p className="font-bold text-[#0f172a]">{s.value}</p>
                    <p className="text-xs text-[#64748b]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Hours Package */}
            {client.monthly_hours && (
              <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[#64748b]">חבילת שעות חודשית</span>
                  <span className="font-medium">
                    {formatHours(totalHours)} מתוך {client.monthly_hours} שעות
                  </span>
                </div>
                <Progress
                  value={Math.min(((totalHours / 3600) / client.monthly_hours) * 100, 100)}
                  color={((totalHours / 3600) / client.monthly_hours) >= 0.8 ? "bg-red-500" : "bg-[#16a34a]"}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks">משימות ({tasks.length})</TabsTrigger>
            <TabsTrigger value="projects">פרויקטים ({projects.length})</TabsTrigger>
            <TabsTrigger value="timers">טיימרים ({timeEntries.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks">
            <Card>
              <CardContent className="p-0">
                {tasks.length === 0 ? (
                  <div className="text-center py-8 text-[#94a3b8]">אין משימות</div>
                ) : (
                  <div className="divide-y divide-[#f1f5f9]">
                    {tasks.map(task => (
                      <Link key={task.id} href={`/tasks/${task.id}`}>
                        <div className="flex items-center gap-4 px-5 py-3 hover:bg-[#f8fafc]">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-[#0f172a] truncate">{task.title}</p>
                            {task.assigned_user && (
                              <p className="text-xs text-[#64748b]">{task.assigned_user.full_name}</p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(task.status)}`}>
                            {getStatusLabel(task.status)}
                          </span>
                          {task.due_date && (
                            <span className={`text-xs ${new Date(task.due_date) < new Date() && task.status !== "completed" ? "text-red-500" : "text-[#94a3b8]"}`}>
                              {new Date(task.due_date).toLocaleDateString("he-IL")}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.length === 0 ? (
                <p className="text-[#94a3b8] col-span-2 text-center py-8">אין פרויקטים</p>
              ) : (
                projects.map(project => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="hover:shadow-md transition-shadow p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-[#0f172a]">{project.name}</p>
                          {project.description && <p className="text-xs text-[#64748b] mt-1">{project.description}</p>}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(project.status)}`}>
                          {getStatusLabel(project.status)}
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="timers">
            <Card>
              <CardContent className="p-0">
                {timeEntries.length === 0 ? (
                  <div className="text-center py-8 text-[#94a3b8]">אין רשומות זמן</div>
                ) : (
                  <div className="divide-y divide-[#f1f5f9]">
                    {timeEntries.map(entry => (
                      <div key={entry.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#0f172a]">{entry.task?.title || "ללא משימה"}</p>
                          <p className="text-xs text-[#64748b]">{entry.user?.full_name}</p>
                        </div>
                        <div className="text-left text-xs text-[#64748b] shrink-0">
                          <p dir="ltr">{formatDateTime(entry.start_time)}</p>
                          {entry.end_time && <p dir="ltr">עד {formatDateTime(entry.end_time)}</p>}
                        </div>
                        <span className="font-mono text-sm font-medium text-[#16a34a]">
                          {formatHours(entry.duration || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showEdit && (
        <ClientFormDialog
          client={client}
          onClose={() => setShowEdit(false)}
          onSave={loadData}
        />
      )}
    </div>
  );
}
