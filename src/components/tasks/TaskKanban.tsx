"use client";

import { Task } from "@/types";
import { getStatusLabel, getStatusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { Calendar, User, Timer } from "lucide-react";
import { useTimerStore } from "@/store/timerStore";
import { toast } from "sonner";

const COLUMNS = [
  { status: "new", label: "חדש", color: "bg-blue-50 border-blue-200" },
  { status: "in_progress", label: "בטיפול", color: "bg-purple-50 border-purple-200" },
  { status: "pending", label: "ממתין", color: "bg-yellow-50 border-yellow-200" },
  { status: "completed", label: "הושלם", color: "bg-green-50 border-green-200" },
];

interface Props {
  tasks: Task[];
  onStatusChange: (id: string, status: string) => void;
  onRefresh: () => void;
}

export default function TaskKanban({ tasks, onStatusChange, onRefresh }: Props) {
  const { startTimer } = useTimerStore();

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) onStatusChange(taskId, status);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.status);
        return (
          <div
            key={col.status}
            className="flex-1 min-w-[260px]"
            onDrop={(e) => handleDrop(e, col.status)}
            onDragOver={handleDragOver}
          >
            <div className={cn("rounded-xl border-2 border-dashed p-3 min-h-[400px]", col.color)}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-[#374151]">{col.label}</h3>
                <span className="text-xs bg-white rounded-full px-2 py-0.5 font-medium text-[#64748b]">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className="bg-white rounded-lg border border-[#e2e8f0] p-3 cursor-grab hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link href={`/tasks/${task.id}`}>
                        <p className="text-sm font-medium text-[#0f172a] hover:text-[#16a34a] leading-tight">
                          {task.title}
                        </p>
                      </Link>
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0 mt-1",
                        task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-yellow-500" : "bg-green-500"
                      )} />
                    </div>
                    {task.customer && (
                      <span className="text-xs bg-[#f1f5f9] text-[#64748b] px-2 py-0.5 rounded-full">
                        {task.customer.company_name}
                      </span>
                    )}
                    <div className="flex items-center justify-between mt-2 text-xs text-[#94a3b8]">
                      <div className="flex items-center gap-2">
                        {task.assigned_user && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {task.assigned_user.full_name.split(" ")[0]}
                          </span>
                        )}
                        {task.due_date && (
                          <span className={cn(
                            "flex items-center gap-1",
                            new Date(task.due_date) < new Date() && task.status !== "completed" ? "text-red-500" : ""
                          )}>
                            <Calendar className="h-3 w-3" />
                            {new Date(task.due_date).toLocaleDateString("he-IL")}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (!task.customer) return;
                          startTimer({
                            customer_id: task.customer_id,
                            customer_name: task.customer.company_name,
                            task_id: task.id,
                            task_title: task.title,
                          });
                          toast.success("טיימר הופעל");
                        }}
                        className="p-1 hover:text-[#16a34a] rounded"
                        title="הפעל טיימר"
                      >
                        <Timer className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="text-center py-6 text-[#94a3b8] text-sm">
                    גרור משימות לכאן
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
