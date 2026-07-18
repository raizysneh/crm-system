"use client";

import { useState, useEffect } from "react";
import { Play, Pause, Square, Timer, ChevronDown, ChevronUp, X } from "lucide-react";
import { useTimerStore, ActiveTimer } from "@/store/timerStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client"; // still used for customers/tasks dropdowns
import { formatDurationSeconds, cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const payload = {
    user_id: userId,
    customer_id: customer_id || snapshot.customer_id || null,
    task_id: task_id || snapshot.task_id || null,
    project_id: snapshot.project_id || null,
    start_time: snapshot.start_time,
    end_time: new Date().toISOString(),
    duration: snapshot.elapsed_seconds,
    notes: notes || "",
  };

  try {
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) return json.error || "שגיאה לא ידועה";
    return null;
  } catch (e: any) {
    return e.message || "שגיאת רשת";
  }
}

export default function FloatingTimer() {
  const { activeTimer, startTimer, pauseTimer, resumeTimer, takeSnapshot, discardTimer } = useTimerStore();
  const { user } = useAuthStore();

  const [expanded, setExpanded] = useState(true);
  const [showStartPopup, setShowStartPopup] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [pendingSnapshot, setPendingSnapshot] = useState<ActiveTimer | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [startCustomer, setStartCustomer] = useState("");
  const [startTask, setStartTask] = useState("");
  const [stopCustomer, setStopCustomer] = useState("");
  const [stopTask, setStopTask] = useState("");
  const [stopNotes, setStopNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Tick every second
  useEffect(() => {
    if (!activeTimer || activeTimer.is_paused) return;
    const id = setInterval(() => useTimerStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, [activeTimer?.is_paused, !!activeTimer]);

  // Load customers when dialogs open
  useEffect(() => {
    if (!showStartPopup && !showStopDialog) return;
    supabase.from("customers").select("id, company_name")
      .eq("status", "active").order("company_name")
      .then(({ data }) => setCustomers(data || []));
  }, [showStartPopup, showStopDialog]);

  // Load tasks
  useEffect(() => {
    const cid = showStartPopup ? startCustomer : stopCustomer;
    if (!cid) { setTasks([]); return; }
    supabase.from("tasks").select("id, title")
      .eq("customer_id", cid).neq("status", "completed").order("title")
      .then(({ data }) => setTasks(data || []));
  }, [startCustomer, stopCustomer]);

  // ── Handlers ──

  const handleStop = () => {
    if (!activeTimer) return;
    const snap = takeSnapshot(); // clears store immediately
    if (!snap) return;

    if (snap.customer_id && user) {
      // Has customer already — save directly
      setSaving(true);
      saveTimeEntry({ userId: user.id, snapshot: snap }).then(err => {
        setSaving(false);
        if (err) toast.error(`שגיאה בשמירה: ${err}`);
        else toast.success("הטיימר נשמר בהצלחה");
      });
    } else {
      // No customer — open dialog with snapshot
      setPendingSnapshot(snap);
      setStopCustomer("");
      setStopTask("");
      setStopNotes("");
      setShowStopDialog(true);
    }
  };

  const handleSaveStop = async () => {
    if (!pendingSnapshot || !user) return;
    setSaving(true);
    const err = await saveTimeEntry({
      userId: user.id,
      snapshot: pendingSnapshot,
      customer_id: stopCustomer || undefined,
      task_id: stopTask || undefined,
      notes: stopNotes,
    });
    setSaving(false);
    if (err) {
      toast.error(`שגיאה בשמירה: ${err}`);
    } else {
      setPendingSnapshot(null);
      setShowStopDialog(false);
      toast.success("הטיימר נשמר בהצלחה");
    }
  };

  const handleDiscard = () => {
    setPendingSnapshot(null);
    setShowStopDialog(false);
    toast("הטיימר בוטל ללא שמירה");
  };

  const elapsed = pendingSnapshot?.elapsed_seconds ?? activeTimer?.elapsed_seconds ?? 0;

  return (
    <>
      {/* ── Floating widget ── */}
      <div className="fixed top-3 left-4 z-50" dir="rtl">
        {activeTimer ? (
          <div className={cn(
            "rounded-2xl shadow-xl border-2 bg-white transition-all min-w-[220px]",
            activeTimer.is_paused ? "border-yellow-300" : "border-[#16a34a]"
          )}>
            {/* Main row */}
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Status dot */}
              <div className={cn("w-3 h-3 rounded-full shrink-0",
                activeTimer.is_paused ? "bg-yellow-400" : "bg-[#16a34a] timer-pulse")} />

              {/* Timer display */}
              <span className={cn("font-mono text-2xl font-bold tabular-nums tracking-wide flex-1",
                activeTimer.is_paused ? "text-yellow-500" : "text-[#16a34a]")}>
                {formatDurationSeconds(activeTimer.elapsed_seconds)}
              </span>

              {/* Controls */}
              <div className="flex items-center gap-1">
                {activeTimer.is_paused
                  ? <button onClick={resumeTimer} title="המשך"
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-green-50 hover:bg-green-100 text-[#16a34a] transition-colors">
                      <Play className="h-4 w-4 fill-current" />
                    </button>
                  : <button onClick={pauseTimer} title="השהה"
                      className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#f1f5f9] text-[#64748b] transition-colors">
                      <Pause className="h-4 w-4 fill-current" />
                    </button>
                }
                <button onClick={handleStop} title="עצור ושמור"
                  className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-red-50 text-red-400 transition-colors">
                  <Square className="h-4 w-4 fill-current" />
                </button>
                <button onClick={() => setExpanded(e => !e)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f1f5f9] text-[#cbd5e1] transition-colors">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Expanded info */}
            {expanded && (
              <div className="border-t border-[#f1f5f9] px-4 py-2.5 bg-[#f8fafc] rounded-b-2xl space-y-0.5">
                {activeTimer.customer_name
                  ? <p className="text-sm font-semibold text-[#374151] truncate">{activeTimer.customer_name}</p>
                  : <p className="text-xs text-[#94a3b8] italic">ללא לקוח — ייבחר בעצירה</p>}
                {activeTimer.task_title && (
                  <p className="text-xs text-[#64748b] truncate">{activeTimer.task_title}</p>
                )}
                <p className="text-xs text-[#94a3b8]">
                  התחיל: {new Date(activeTimer.start_time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => { setStartCustomer(""); setStartTask(""); setShowStartPopup(true); }}
            className="flex items-center gap-2 bg-[#16a34a] hover:bg-[#15803d] text-white px-5 py-2.5 rounded-2xl shadow-lg font-semibold text-sm transition-all hover:shadow-xl active:scale-95">
            <Timer className="h-4 w-4" />
            הפעל טיימר
          </button>
        )}
      </div>

      {/* ── Start popup ── */}
      {showStartPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowStartPopup(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
              <h2 className="font-bold text-[#0f172a] text-lg">הפעל טיימר</h2>
              <button onClick={() => setShowStartPopup(false)} className="p-1.5 rounded-lg hover:bg-[#f1f5f9] text-[#94a3b8]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-[#64748b]">ניתן לבחור לקוח עכשיו, או לדלג ולבחור בסיום</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#374151]">לקוח (אופציונלי)</label>
                <select value={startCustomer} onChange={e => { setStartCustomer(e.target.value); setStartTask(""); }}
                  className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                  <option value="">-- ללא לקוח --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              {startCustomer && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#374151]">משימה (אופציונלי)</label>
                  <select value={startTask} onChange={e => setStartTask(e.target.value)}
                    className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                    <option value="">-- ללא משימה --</option>
                    {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-[#f1f5f9] bg-[#f8fafc]">
              <button onClick={() => { startTimer(); setShowStartPopup(false); }}
                className="flex-1 h-10 rounded-xl border border-[#e2e8f0] text-sm font-medium text-[#64748b] hover:bg-[#f1f5f9]">
                דלג והפעל
              </button>
              <button onClick={() => {
                  const cust = customers.find(c => c.id === startCustomer);
                  startTimer({ customer_id: startCustomer || undefined, customer_name: cust?.company_name, task_id: startTask || undefined });
                  setShowStartPopup(false);
                }}
                className="flex-1 h-10 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-bold active:scale-95">
                <Play className="h-4 w-4 inline ml-1 fill-current" /> הפעל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stop dialog ── */}
      {showStopDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
              <div>
                <h2 className="font-bold text-[#0f172a] text-lg">שמירת טיימר</h2>
                <p className="text-sm text-[#64748b]">
                  זמן: <span className="font-mono font-semibold text-[#16a34a]">{formatDurationSeconds(elapsed)}</span>
                </p>
              </div>
              <button onClick={() => setShowStopDialog(false)} className="p-1.5 rounded-lg hover:bg-[#f1f5f9] text-[#94a3b8]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#374151]">לקוח (אופציונלי)</label>
                <select value={stopCustomer} onChange={e => { setStopCustomer(e.target.value); setStopTask(""); }}
                  className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                  <option value="">-- ללא לקוח --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              {stopCustomer && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#374151]">משימה (אופציונלי)</label>
                  <select value={stopTask} onChange={e => setStopTask(e.target.value)}
                    className="w-full h-10 border border-[#e2e8f0] rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                    <option value="">-- ללא משימה --</option>
                    {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#374151]">הערות</label>
                <textarea value={stopNotes} onChange={e => setStopNotes(e.target.value)}
                  placeholder="מה עשית?" rows={2}
                  className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-[#f1f5f9] bg-[#f8fafc]">
              <button onClick={handleDiscard}
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
