"use client";

import { useEffect } from "react";
import { Play, Pause, Square } from "lucide-react";
import { useTimerStore } from "@/store/timerStore";
import { formatDurationSeconds } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function GlobalTimer() {
  const { activeTimer, pauseTimer, resumeTimer, stopTimer } = useTimerStore();

  useEffect(() => {
    if (activeTimer && !activeTimer.is_paused) {
      const id = setInterval(() => {
        useTimerStore.getState().tick();
      }, 1000);
      return () => clearInterval(id);
    }
  }, [activeTimer?.is_paused]);

  if (!activeTimer) return null;

  return (
    <div className={cn(
      "flex items-center gap-3 bg-white border border-[#e2e8f0] rounded-lg px-4 py-2 shadow-sm",
      !activeTimer.is_paused && "border-[#16a34a]"
    )}>
      <div className={cn(
        "w-2 h-2 rounded-full",
        activeTimer.is_paused ? "bg-yellow-500" : "bg-[#16a34a] timer-pulse"
      )} />
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-medium text-[#0f172a] truncate max-w-[150px]">
          {activeTimer.customer_name}
        </span>
        {activeTimer.task_title && (
          <span className="text-xs text-[#64748b] truncate max-w-[150px]">
            {activeTimer.task_title}
          </span>
        )}
      </div>
      <span className={cn(
        "font-mono text-sm font-semibold tabular-nums",
        activeTimer.elapsed_seconds > 0 ? "text-[#16a34a]" : "text-[#64748b]"
      )}>
        {formatDurationSeconds(activeTimer.elapsed_seconds)}
      </span>
      <div className="flex items-center gap-1">
        {activeTimer.is_paused ? (
          <button
            onClick={resumeTimer}
            className="p-1.5 rounded-md hover:bg-[#f1f5f9] text-[#16a34a]"
            title="המשך"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={pauseTimer}
            className="p-1.5 rounded-md hover:bg-[#f1f5f9] text-[#64748b]"
            title="השהה"
          >
            <Pause className="h-3.5 w-3.5 fill-current" />
          </button>
        )}
        <button
          onClick={() => stopTimer()}
          className="p-1.5 rounded-md hover:bg-red-50 text-red-500"
          title="עצור"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
    </div>
  );
}
