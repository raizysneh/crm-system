import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ActiveTimer {
  id: string;
  customer_id?: string;
  customer_name?: string;
  task_id?: string;
  task_title?: string;
  project_id?: string;
  start_time: string;
  // Accumulated seconds from all completed run-segments (not the current one)
  elapsed_seconds: number;
  // Wall-clock timestamp of the last resume (or initial start_time if never paused)
  last_resume_time?: string;
  is_paused: boolean;
}

// True elapsed seconds: accumulated + wall-clock since last resume.
// Works correctly even when the page was closed mid-run.
export function getTimerDisplaySeconds(timer: ActiveTimer): number {
  if (timer.is_paused) return timer.elapsed_seconds;
  if (!timer.last_resume_time) {
    // Old timer from before this tracking was added — use pure wall-clock from start
    return Math.floor((Date.now() - new Date(timer.start_time).getTime()) / 1000);
  }
  const sinceResume = Math.floor((Date.now() - new Date(timer.last_resume_time).getTime()) / 1000);
  return timer.elapsed_seconds + Math.max(0, sinceResume);
}

interface TimerStore {
  timers: ActiveTimer[];
  activeTimer: ActiveTimer | null;
  startTimer: (data?: Partial<Pick<ActiveTimer, "customer_id" | "customer_name" | "task_id" | "task_title" | "project_id">>) => void;
  pauseTimer: (id?: string) => void;
  resumeTimer: (id?: string) => void;
  takeSnapshot: (id?: string) => ActiveTimer | null;
  discardTimer: (id?: string) => void;
  tick: () => void;
}

function withActive(timers: ActiveTimer[]) {
  return { timers, activeTimer: timers[0] ?? null };
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      timers: [],
      activeTimer: null,

      startTimer: (data = {}) => {
        const now = new Date().toISOString();
        const t: ActiveTimer = {
          id: `t_${Date.now()}`,
          ...data,
          start_time: now,
          elapsed_seconds: 0,
          last_resume_time: now,
          is_paused: false,
        };
        set(s => withActive([...s.timers, t]));
      },

      pauseTimer: (id) => {
        set(s => withActive(s.timers.map(t => {
          const isTarget = id ? t.id === id : t.id === s.timers[0]?.id;
          if (!isTarget || t.is_paused) return t;
          const base = t.last_resume_time ?? t.start_time;
          const sinceResume = Math.floor((Date.now() - new Date(base).getTime()) / 1000);
          return { ...t, is_paused: true, elapsed_seconds: t.elapsed_seconds + Math.max(0, sinceResume) };
        })));
      },

      resumeTimer: (id) => {
        const now = new Date().toISOString();
        set(s => withActive(s.timers.map(t => {
          const isTarget = id ? t.id === id : t.id === s.timers[0]?.id;
          if (!isTarget) return t;
          return { ...t, is_paused: false, last_resume_time: now };
        })));
      },

      takeSnapshot: (id) => {
        const timers = get().timers;
        const target = id ? timers.find(t => t.id === id) : timers[0];
        if (!target) return null;
        // Finalize elapsed_seconds with wall-clock time before removing
        const finalElapsed = getTimerDisplaySeconds(target);
        const snapshot: ActiveTimer = { ...target, elapsed_seconds: finalElapsed, is_paused: true };
        set(s => withActive(s.timers.filter(t => t.id !== target.id)));
        return snapshot;
      },

      discardTimer: (id) => {
        set(s => {
          const targetId = id ?? s.timers[0]?.id;
          return withActive(s.timers.filter(t => t.id !== targetId));
        });
      },

      // tick is kept for backward compat but display no longer depends on it
      tick: () => {},
    }),
    {
      name: "crm-timer",
      partialize: s => ({ timers: s.timers, activeTimer: s.activeTimer }),
    }
  )
);
