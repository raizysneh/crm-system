"use client";

import { useState, useEffect } from "react";
import { Plus, Search, FolderOpen } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase/client";
import { Project, Customer } from "@/types";
import { toast } from "sonner";
import { getStatusLabel, getStatusColor } from "@/lib/utils";
import Link from "next/link";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadData(); }, [filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase.from("projects").select(`
        *,
        customer:customers(id, company_name, logo_url),
        tasks(id, status)
      `).order("created_at", { ascending: false });

      if (filterStatus !== "all") query = query.eq("status", filterStatus);

      const [projectsRes, clientsRes] = await Promise.all([
        query,
        supabase.from("customers").select("id, company_name").eq("status", "active"),
      ]);

      const withProgress = (projectsRes.data || []).map(p => {
        const tasks = p.tasks || [];
        const completed = tasks.filter((t: any) => t.status === "completed").length;
        const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
        return { ...p, tasks_count: tasks.length, completed_tasks: completed, open_tasks: tasks.filter((t: any) => !["completed", "cancelled"].includes(t.status)).length, progress };
      });

      setProjects(withProgress);
      setClients(clientsRes.data || []);
    } catch { toast.error("שגיאה בטעינת פרויקטים"); }
    finally { setLoading(false); }
  };

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.customer?.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <Header title="פרויקטים" />
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
            <Input placeholder="חיפוש פרויקט..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="סטטוס" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="new">חדש</SelectItem>
              <SelectItem value="active">פעיל</SelectItem>
              <SelectItem value="pending">ממתין</SelectItem>
              <SelectItem value="completed">הושלם</SelectItem>
              <SelectItem value="cancelled">בוטל</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> פרויקט חדש
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[#94a3b8]">
            <FolderOpen className="h-14 w-14 mx-auto mb-3 opacity-20" />
            <p>אין פרויקטים להצגה</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(project => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-[#0f172a] hover:text-[#16a34a]">{project.name}</h3>
                        <p className="text-sm text-[#64748b] mt-0.5">{project.customer?.company_name}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(project.status)}`}>
                        {getStatusLabel(project.status)}
                      </span>
                    </div>

                    {project.description && (
                      <p className="text-xs text-[#64748b] mb-3 line-clamp-2">{project.description}</p>
                    )}

                    <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                      <div className="bg-[#f8fafc] rounded-lg p-2">
                        <p className="font-bold text-[#0f172a]">{project.tasks_count || 0}</p>
                        <p className="text-[#94a3b8]">משימות</p>
                      </div>
                      <div className="bg-[#f8fafc] rounded-lg p-2">
                        <p className="font-bold text-blue-600">{project.open_tasks || 0}</p>
                        <p className="text-[#94a3b8]">פתוחות</p>
                      </div>
                      <div className="bg-[#f8fafc] rounded-lg p-2">
                        <p className="font-bold text-green-600">{project.completed_tasks || 0}</p>
                        <p className="text-[#94a3b8]">הושלמו</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#64748b]">התקדמות</span>
                        <span className="font-medium">{project.progress || 0}%</span>
                      </div>
                      <Progress value={project.progress || 0} className="h-1.5" />
                    </div>

                    {(project.start_date || project.due_date) && (
                      <div className="flex justify-between text-xs text-[#94a3b8] mt-3">
                        {project.start_date && <span>התחלה: {new Date(project.start_date).toLocaleDateString("he-IL")}</span>}
                        {project.due_date && <span>יעד: {new Date(project.due_date).toLocaleDateString("he-IL")}</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ProjectFormDialog
          clients={clients}
          onClose={() => setShowForm(false)}
          onSave={loadData}
        />
      )}
    </div>
  );
}
