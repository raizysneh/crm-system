import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";

export interface LiveTimerSnapshot {
  customer_name?: string;
  task_title?: string;
  is_paused: boolean;
  start_time: string;
  elapsed_seconds: number;
  last_resume_time?: string;
}

export interface LiveTimerUser {
  user_id: string;
  full_name: string;
  timers: LiveTimerSnapshot[];
}

interface TimerPresenceStore {
  users: LiveTimerUser[];
  channel: ReturnType<typeof supabase.channel> | null;
  // Only FloatingTimer (mounted app-wide) should call this — it owns the one
  // "global-timer-presence" channel for the whole tab and tracks its own
  // state on it. Everyone else (e.g. the dashboard) just reads `users`.
  ensureChannel: (presenceKey: string) => ReturnType<typeof supabase.channel>;
}

export const useTimerPresenceStore = create<TimerPresenceStore>((set, get) => ({
  users: [],
  channel: null,

  ensureChannel: (presenceKey: string) => {
    const existing = get().channel;
    if (existing) return existing;

    const channel = supabase.channel("global-timer-presence", { config: { presence: { key: presenceKey } } });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const list = Object.values(state).flat().map((p: any) => p as LiveTimerUser);
      set({ users: list });
    }).subscribe();

    set({ channel });
    return channel;
  },
}));
