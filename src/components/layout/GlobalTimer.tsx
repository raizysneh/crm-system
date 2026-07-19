"use client";

import { useEffect } from "react";
import { useTimerStore } from "@/store/timerStore";

// GlobalTimer only keeps the tick alive for any open page that doesn't render FloatingTimer.
// FloatingTimer handles its own tick when visible.
export default function GlobalTimer() {
  const timers = useTimerStore(s => s.timers);
  const hasRunning = timers.some(t => !t.is_paused);

  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => useTimerStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  return null;
}
