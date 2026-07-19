"use client";

import { useState, useEffect } from "react";
import { Play, Pause, Square, Timer, Plus, X, Minus, ExternalLink, RotateCcw } from "lucide-react";
import { useTimerStore, ActiveTimer } from "@/store/timerStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { formatDurationSeconds, cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

interface Customer { id: string; company_name: string; }
interface Task { id: string; title: string; }

async function saveTimeEntry(params: {
  userId: string;
  snapshot: ActiveTimer;
  customer_id?: string;
  task_id?: string;
  notes?: string;
}): Promise<string | null> {
  const { userId, snapshot, customer_id, task_id, notes } = params;
  try {
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        customer_id: customer_id || snapshot.customer_id || null,
        task_id: task_id || snapshot.task_id || null,
        project_id: snapshot.project_id || null,
        start_time: snapshot.start_time,
        end_time: new Date().toISOString(),
        duration: snapshot.elapsed_seconds,
        notes: notes || "",
      }),
    });
    const json = await res.json();
    return res.ok ? null : json.error || "שגיאה לא ידועה";
  } catch (e: any) {
    return e.message || "שגיאת רשת";
  }
}

interface StopState {
  snapshot: ActiveTimer;
  customer: string;
  task: string;
  notes: string;
}

export default function FloatingTimer() {
  const { timers, startTimer, pauseTimer, resumeTimer, takeSnapshot, discardTimer } = useTimerStore();
  const { user } = useAuthStore();

  const [minimized, setMinimized]   = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [stopState, setStopState]   = useState<StopState | null>(null);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [addCustomer, setAddCustomer] = useState("");
  const [addTask, setAddTask]       = useState("");
  const [saving, setSaving]         = useState(false);

  // Tick all running timers
  const hasRunning = timers.some(t => !t.is_paused);
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => useTimerStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  // Load customers when dialog opens
  useEffect(() => {
    if (!showAdd && !stopState) return;
    supabase.from("customers").select("id,company_name").eq("status", "active").order("company_name")
      .then(({ data }) => setCustomers(data || []));
  }, [showAdd, !!stopState]);

  // Load tasks when customer changes
  useEffect(() => {
    const cid = showAdd ? addCustomer : stopState?.customer;
    if (!cid) { setTasks([]); return; }
    supabase.from("tasks").select("id,title").eq("customer_id", cid).neq("status", "completed").order("title")
      .then(({ data }) => setTasks(data || []));
  }, [addCustomer, stopState?.customer]);

  const handleStop = (timer: ActiveTimer) => {
    const snap = takeSnapshot(timer.id);
    if (!snap) return;
    if (snap.customer_id && user) {
      setSaving(true);
      saveTimeEntry({ userId: user.id, snapshot: snap }).then(err => {
        setSaving(false);
        if (err) toast.error(`שגיאה בשמירה: ${err}`);
        else toast.success("הטיימר נשמר");
      });
    } else {
      setStopState({ snapshot: snap, customer: "", task: "", notes: "" });
    }
  };

  const handleSaveStop = async () => {
    if (!stopState || !user) return;
    setSaving(true);
    const err = await saveTimeEntry({
      userId: user.id,
      snapshot: stopState.snapshot,
      customer_id: stopState.customer || undefined,
      task_id: stopState.task || undefined,
      notes: stopState.notes,
    });
    setSaving(false);
    if (err) toast.error(`שגיאה בשמירה: ${err}`);
    else { setStopState(null); toast.success("הטיימר נשמר"); }
  };

  const handleAddTimer = () => {
    const cust = customers.find(c => c.id === addCustomer);
    const task = tasks.find(t => t.id === addTask);
    startTimer({
      customer_id: addCustomer || undefined,
      customer_name: cust?.company_name,
      task_id: addTask || undefined,
      task_title: task?.title,
    });
    setShowAdd(false);
    setAddCustomer("");
    setAddTask("");
  };

  const totalSeconds = timers.reduce((s, t) => s + t.elapsed_seconds, 0);

  // ── No timers — just show start button ────────────────────────────────────
  if (timers.length === 0) {
    return (
      <div className="fixed top-3 left-4 z-[9999]" dir="rtl">
        <button
          onClick={() => { setAddCustomer(""); setAddTask(""); setShowAdd(true); }}
          className="flex items-center gap-2 bg-[#16a34a] hover:bg-[#15803d] text-white px-5 py-2.5 rounded-2xl shadow-lg font-semibold text-sm transition-all hover:shadow-xl active:scale-95"
        >
          <Timer className="h-4 w-4" /> הפעל טיימר
        </button>
        {showAdd && <AddPopup customers={customers} tasks={tasks} customer={addCustomer} task={addTask}
          onCustomer={v => { setAddCustomer(v); setAddTask(""); }} onTask={setAddTask}
          onStart={handleAddTimer} onSkip={() => { startTimer(); setShowAdd(false); }} onClose={() => setShowAdd(false)} />}
      </div>
    );
  }

  // ── Minimized circle ───────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed top-4 left-4 z-[9999]" dir="rtl">
        <button
          onClick={() => setMinimized(false)}
          title="הצג טיימרים"
          className={cn(
            "w-16 h-16 rounded-full shadow-2xl flex flex-col items-center justify-center transition-all active:scale-95 border-4",
            hasRunning
              ? "bg-[#16a34a] border-[#15803d] text-white timer-pulse"
              : "bg-yellow-400 border-yellow-500 text-[#0f172a]"
          )}
        >
          <Timer className="h-4 w-4 mb-0.5" />
          <span className="font-mono text-[11px] font-bold tabular-nums leading-none">
            {formatDurationSeconds(totalSeconds)}
          </span>
          {timers.length > 1 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold shadow">
              {timers.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  // ── Full widget ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed top-3 left-4 z-[9999] w-[290px]" dir="rtl">
        <div className="rounded-2xl shadow-2xl overflow-hidden border border-[#16a34a]/40">

          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0f172a]">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", hasRunning ? "bg-[#16a34a] timer-pulse" : "bg-yellow-400")} />
              <span className="text-white text-sm font-bold">
                טיימרים פעילים ({timers.length})
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <Link href="/timers" title="עמוד טיימרים"
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <button onClick={() => setMinimized(true)} title="מזעור"
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { timers.forEach(t => discardTimer(t.id)); }} title="סגור הכל"
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/30 text-white/50 hover:text-red-400 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Timer rows */}
          <div className="bg-white divide-y divide-[#f1f5f9] max-h-[320px] overflow-y-auto">
            {timers.map(timer => (
              <div key={timer.id} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  {/* Left: stop + reset buttons */}
                  <div className="flex flex-col gap-1 pt-0.5">
                    <button onClick={() => handleStop(timer)} title="עצור ושמור"
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-500 transition-colors">
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                    <button onClick={() => {
                        if (timer.is_paused) resumeTimer(timer.id); else pauseTimer(timer.id);
                      }} title={timer.is_paused ? "המשך" : "השהה"}
                      className={cn("w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                        timer.is_paused
                          ? "bg-green-50 hover:bg-green-100 text-[#16a34a]"
                          : "bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#64748b]"
                      )}>
                      {timer.is_paused
                        ? <Play className="h-3 w-3 fill-current" />
                        : <Pause className="h-3 w-3 fill-current" />}
                    </button>
                  </div>

                  {/* Middle: customer + task + time */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0f172a] truncate leading-tight">
                      {timer.customer_name || "ללא לקוח"}
                    </p>
                    {timer.task_title && (
                      <p className="text-xs text-[#64748b] truncate mt-0.5">{timer.task_title}</p>
                    )}
                    <span className={cn(
                      "font-mono text-xl font-bold tabular-nums mt-1 block",
                      timer.is_paused ? "text-yellow-500" : "text-[#16a34a]"
                    )}>
                      {formatDurationSeconds(timer.elapsed_seconds)}
                    </span>
                  </div>

                  {/* Right: status dot */}
                  <div className={cn("w-2.5 h-2.5 rounded-full mt-1 shrink-0",
                    timer.is_paused ? "bg-yellow-400" : "bg-[#16a34a] timer-pulse")} />
                </div>
              </div>
            ))}
          </div>

          {/* Footer: add customer */}
          <div className="bg-[#f8fafc] border-t border-[#f1f5f9] px-3 py-2.5">
            <button
              onClick={() => { setAddCustomer(""); setAddTask(""); setShowAdd(true); }}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-[#16a34a] hover:bg-green-50 rounded-xl py-1.5 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              הוסיפי לקוח נוסף
            </button>
          </div>
        </div>
      </div>

      {/* Add-timer popup */}
      {showAdd && (
        <AddPopup
          customers={customers} tasks={tasks}
          customer={addCustomer} task={addTask}
          onCustomer={v => { setAddCustomer(v); setAddTask(""); }}
          onTask={setAddTask}
          onStart={handleAddTimer}
          onSkip={() => { startTimer(); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Stop / save dialog */}
      {stopState && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
              <div>
                <h2 className="font-bold text-[#0f172a] text-lg">שמירת טיימר</h2>
                <p className="text-sm text-[#64748b]">
                  זמן: <span className="font-mono font-semibold text-[#16a34a]">
                    {formatDurationSeconds(stopState.snapshot.elapsed_seconds)}
                  </span>
                </p>
              </div>
              <button onClick={() => setStopState(null)} className="p-1.5 rounded-lg hover:bg-[#f1f5f9] text-[#94a3b8]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#374151]">לקוח (אופציונלי)</label>
                <select value={stopState.customer}
                  onChange={e => setStopState(s => s && { ...s, customer: e.target.value, task: "" })}
                  className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                  <option value="">-- ללא לקוח --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              {stopState.customer && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#374151]">משימה (אופציונלי)</label>
                  <select value={stopState.task}
                    onChange={e => setStopState(s => s && { ...s, task: e.target.value })}
                    className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                    <option value="">-- ללא משימה --</option>
                    {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#374151]">הערות</label>
                <textarea value={stopState.notes}
                  onChange={e => setStopState(s => s && { ...s, notes: e.target.value })}
                  placeholder="מה עשית?" rows={2}
                  className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-[#f1f5f9] bg-[#f8fafc]">
              <button onClick={() => setStopState(null)}
                className="flex-1 h-10 rounded-xl border border-[#e2e8f0] text-sm font-medium text-red-500 hover:bg-red-50">
                בטל ללא שמירה
              </button>
              <button onClick={handleSaveStop} disabled={saving}
                className={cn("flex-1 h-10 rounded-xl text-sm font-bold text-white",
                  saving ? "bg-[#94a3b8]" : "bg-[#16a34a] hover:bg-[#15803d] active:scale-95")}>
                {saving ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Add Timer Popup ─────────────────────────────────────────────────────────

function AddPopup({ customers, tasks, customer, task, onCustomer, onTask, onStart, onSkip, onClose }: {
  customers: Customer[];
  tasks: Task[];
  customer: string;
  task: string;
  onCustomer: (v: string) => void;
  onTask: (v: string) => void;
  onStart: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
          <h2 className="font-bold text-[#0f172a] text-lg">הפעל טיימר</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f1f5f9] text-[#94a3b8]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-[#64748b]">בחר לקוח עכשיו או דלג ובחר בעצירה</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#374151]">לקוח (אופציונלי)</label>
            <select value={customer} onChange={e => onCustomer(e.target.value)}
              className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
              <option value="">-- ללא לקוח --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          {customer && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#374151]">משימה (אופציונלי)</label>
              <select value={task} onChange={e => onTask(e.target.value)}
                className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                <option value="">-- ללא משימה --</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[#f1f5f9] bg-[#f8fafc]">
          <button onClick={onSkip}
            className="flex-1 h-10 rounded-xl border border-[#e2e8f0] text-sm font-medium text-[#64748b] hover:bg-[#f1f5f9]">
            דלג והפעל
          </button>
          <button onClick={onStart}
            className="flex-1 h-10 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-bold active:scale-95">
            <Play className="h-4 w-4 inline ml-1 fill-current" /> הפעל
          </button>
        </div>
      </div>
    </div>
  );
}
