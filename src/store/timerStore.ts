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
  elapsed_seconds: number;
  is_paused: boolean;
}

interface TimerStore {
  timers: ActiveTimer[];
  // backward-compat: first timer or null
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
        const t: ActiveTimer = {
          id: `t_${Date.now()}`,
          ...data,
          start_time: new Date().toISOString(),
          elapsed_seconds: 0,
          is_paused: false,
        };
        set(s => withActive([...s.timers, t]));
      },

      pauseTimer: (id) => {
        set(s => withActive(s.timers.map(t =>
          (id ? t.id === id : t.id === s.timers[0]?.id) ? { ...t, is_paused: true } : t
        )));
      },

      resumeTimer: (id) => {
        set(s => withActive(s.timers.map(t =>
          (id ? t.id === id : t.id === s.timers[0]?.id) ? { ...t, is_paused: false } : t
        )));
      },

      takeSnapshot: (id) => {
        const timers = get().timers;
        const target = id ? timers.find(t => t.id === id) : timers[0];
        if (!target) return null;
        set(s => withActive(s.timers.filter(t => t.id !== target.id)));
        return target;
      },

      discardTimer: (id) => {
        set(s => {
          const targetId = id ?? s.timers[0]?.id;
          return withActive(s.timers.filter(t => t.id !== targetId));
        });
      },

      tick: () => {
        set(s => withActive(s.timers.map(t =>
          t.is_paused ? t : { ...t, elapsed_seconds: t.elapsed_seconds + 1 }
        )));
      },
    }),
    {
      name: "crm-timer",
      partialize: s => ({ timers: s.timers, activeTimer: s.activeTimer }),
    }
  )
);
