import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ActiveTimer {
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
  activeTimer: ActiveTimer | null;
  startTimer: (data?: Partial<Pick<ActiveTimer, "customer_id" | "customer_name" | "task_id" | "task_title" | "project_id">>) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  // Returns the snapshot then clears — caller is responsible for DB insert
  takeSnapshot: () => ActiveTimer | null;
  discardTimer: () => void;
  tick: () => void;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      activeTimer: null,

      startTimer: (data = {}) => {
        set({
          activeTimer: {
            ...data,
            start_time: new Date().toISOString(),
            elapsed_seconds: 0,
            is_paused: false,
          },
        });
      },

      pauseTimer: () => {
        set((s) => ({
          activeTimer: s.activeTimer ? { ...s.activeTimer, is_paused: true } : null,
        }));
      },

      resumeTimer: () => {
        set((s) => ({
          activeTimer: s.activeTimer ? { ...s.activeTimer, is_paused: false } : null,
        }));
      },

      takeSnapshot: () => {
        const snap = get().activeTimer;
        set({ activeTimer: null });
        return snap;
      },

      discardTimer: () => {
        set({ activeTimer: null });
      },

      tick: () => {
        set((s) => {
          if (!s.activeTimer || s.activeTimer.is_paused) return s;
          return {
            activeTimer: { ...s.activeTimer, elapsed_seconds: s.activeTimer.elapsed_seconds + 1 },
          };
        });
      },
    }),
    {
      name: "crm-timer",
      partialize: (s) => ({ activeTimer: s.activeTimer }),
    }
  )
);
