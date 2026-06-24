"use client";

import { useState } from "react";
import Link from "next/link";
import { Timer, MoreVertical, CheckCircle, AlertCircle, Calendar, User } from "lucide-react";
import { Task } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn, getStatusLabel, getStatusColor, getPriorityColor, isOverdue } from "@/lib/utils";
import { useTimerStore } from "@/store/timerStore";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

interface Props {
  task: Task;
  onStatusChange: (id: string, status: string) => void;
  onRefresh: () => void;
}

export default function TaskCard({ task, onStatusChange, onRefresh }: Props) {
  const { startTimer } = useTimerStore();
  const { user } = useAuthStore();

  const handleStartTimer = () => {
    if (!task.customer) return;
    startTimer({
      customer_id: task.customer_id,
      customer_name: task.customer.company_name,
      task_id: task.id,
      task_title: task.title,
      project_id: task.project_id,
      project_name: task.project?.name,
    });
    toast.success(`טיימר הופעל: ${task.title}`);
  };

  const handleRequestDelete = async () => {
    if (!confirm("שלח בקשת מחיקה למנהל?")) return;
    const { error } = await supabase.from("tasks").update({ pending_deletion: true }).eq("id", task.id);
    if (error) toast.error("שגיאה בשליחת הבקשה");
    else { toast.success("בקשת המחיקה נשלחה למנהל"); onRefresh(); }
  };

  const handleDelete = async () => {
    if (!confirm("למחוק משימה זו לצמיתות?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) toast.error("שגיאה במחיקה");
    else { toast.success("המשימה נמחקה"); onRefresh(); }
  };

  const overdue = task.due_date && isOverdue(task.due_date) && task.status !== "completed";

  return (
    <div className={cn(
      "bg-white border border-[#e2e8f0] rounded-xl p-4 hover:shadow-md transition-shadow",
      task.pending_deletion && "opacity-60 border-red-200 bg-red-50",
      overdue && "border-red-200"
    )}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => onStatusChange(task.id, task.status === "completed" ? "in_progress" : "completed")}
          className={cn(
            "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
            task.status === "completed"
              ? "bg-[#16a34a] border-[#16a34a]"
              : "border-[#cbd5e1] hover:border-[#16a34a]"
          )}
        >
          {task.status === "completed" && <CheckCircle className="h-3.5 w-3.5 text-white fill-white" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/tasks/${task.id}`}>
              <h3 className={cn(
                "font-medium text-sm hover:text-[#16a34a] transition-colors",
                task.status === "completed" ? "text-[#94a3b8] line-through" : "text-[#0f172a]"
              )}>
                {task.title}
              </h3>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              {/* Priority dot */}
              <span className={cn(
                "w-2 h-2 rounded-full",
                task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-yellow-500" : "bg-green-500"
              )} title={`עדיפות ${task.priority === "high" ? "גבוהה" : task.priority === "medium" ? "בינונית" : "נמוכה"}`} />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(task.status)}`}>
                {getStatusLabel(task.status)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleStartTimer}>
                    <Timer className="h-4 w-4" /> הפעל טיימר
                  </DropdownMenuItem>
                  <Link href={`/tasks/${task.id}`}>
                    <DropdownMenuItem>פתח משימה</DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  {["new", "in_progress", "pending", "completed"].map(s => (
                    <DropdownMenuItem key={s} onClick={() => onStatusChange(task.id, s)}>
                      שנה ל: {getStatusLabel(s)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  {user?.role === "admin" ? (
                    <DropdownMenuItem destructive onClick={handleDelete}>מחק</DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem destructive onClick={handleRequestDelete}>בקש מחיקה</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-1.5 text-xs text-[#64748b] flex-wrap">
            {task.customer && (
              <span className="bg-[#f1f5f9] px-2 py-0.5 rounded-full">{task.customer.company_name}</span>
            )}
            {task.project && <span>{task.project.name}</span>}
            {task.assigned_user && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {task.assigned_user.full_name}
              </span>
            )}
            {task.due_date && (
              <span className={cn("flex items-center gap-1", overdue ? "text-red-500 font-medium" : "")}>
                <Calendar className="h-3 w-3" />
                {new Date(task.due_date).toLocaleDateString("he-IL")}
                {overdue && " (איחור!)"}
              </span>
            )}
          </div>

          {/* Progress */}
          {task.subtasks_count && task.subtasks_count > 0 ? (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <Progress value={task.progress || 0} className="h-1.5 flex-1" />
                <span className="text-xs text-[#64748b] shrink-0">
                  {task.completed_subtasks}/{task.subtasks_count}
                </span>
              </div>
            </div>
          ) : null}

          {task.pending_deletion && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="h-3 w-3" />
              <span>ממתינה לאישור מחיקה</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
