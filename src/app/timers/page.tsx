"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Trash2, Edit2, Check, X, Clock } from "lucide-react";
import Header from "@/components/layout/Header";
import { supabase, authHeader } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useTimerStore, getTimerDisplaySeconds } from "@/store/timerStore";
import { formatDurationSeconds, cn } from "@/lib/utils";
import { toast } from "sonner";

interface Entry {
  id: string; user_id: string; customer_id: string | null; task_id: string | null;
  project_id: string | null; start_time: string; end_time: string | null;
  duration: number; notes: string | null;
  customer?: { company_name: string } | null;
  task?: { title: string } | null;
  user?: { full_name: string } | null;
}

interface SysSettings {
  timer_edit_mode?: "none" | "free" | "days" | "approval";
  timer_edit_days?: number;
}

interface DayGroup { date: string; label: string; entries: Entry[]; totalSeconds: number; }

type Period = "week" | "month";

const DAYS_HE   = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function dateLabel(dateStr: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  const d = new Date(dateStr);
  if (d.getTime()===today.getTime())     return "היום";
  if (d.getTime()===yesterday.getTime()) return "אתמול";
  return `${DAYS_HE[d.getDay()]}, ${d.getDate()} ${MONTHS_HE[d.getMonth()]}`;
}
function toLocalDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatTimeOfDay(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
}
function isoToTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function applyTime(baseISO: string, timeStr: string) {
  const d = new Date(baseISO);
  const [h,m] = timeStr.split(":").map(Number);
  if (isNaN(h)||isNaN(m)) return baseISO;
  d.setHours(h,m,0,0);
  return d.toISOString();
}
function timeDiffSecs(startISO: string, startTime: string, endTime: string) {
  if (!startTime||!endTime) return 0;
  const [sh,sm]=startTime.split(":").map(Number);
  const [eh,em]=endTime.split(":").map(Number);
  let secs=(eh*60+em-sh*60-sm)*60;
  if(secs<0) secs+=86400;
  return secs;
}

function getWeekRange(base: Date) {
  const start = new Date(base); start.setHours(0,0,0,0);
  start.setDate(start.getDate()-start.getDay());
  const end = new Date(start); end.setDate(end.getDate()+6); end.setHours(23,59,59,999);
  return { start, end };
}
function getMonthRange(base: Date) {
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  start.setHours(0,0,0,0);
  const end = new Date(base.getFullYear(), base.getMonth()+1, 0);
  end.setHours(23,59,59,999);
  return { start, end };
}
function isCurrent(period: Period, base: Date) {
  const now = new Date();
  if (period==="week") {
    const { start: s } = getWeekRange(now);
    return getWeekRange(base).start.getTime()===s.getTime();
  }
  return base.getFullYear()===now.getFullYear() && base.getMonth()===now.getMonth();
}

export default function TimersPage() {
  const { user } = useAuthStore();
  const { timers, activeTimer, startTimer } = useTimerStore();

  const [period,    setPeriod]    = useState<Period>("week");
  const [base,      setBase]      = useState(new Date());
  const [groups,    setGroups]    = useState<DayGroup[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editingId,   setEditingId]   = useState<string|null>(null);
  const [editNotes,   setEditNotes]   = useState("");
  const [editCustomer,setEditCustomer]= useState("");
  const [editStart,   setEditStart]   = useState("");
  const [editEnd,     setEditEnd]     = useState("");
  const [editDuration,setEditDuration]= useState(0);
  const [customers, setCustomers] = useState<{id:string;company_name:string}[]>([]);
  const [sysSettings, setSysSettings] = useState<SysSettings>({ timer_edit_mode: "free" });

  const range = period==="week" ? getWeekRange(base) : getMonthRange(base);
  const atCurrent = isCurrent(period, base);

  useEffect(()=>{ loadEntries(); }, [base, period, user]);
  useEffect(()=>{
    supabase.from("customers").select("id,company_name").eq("status","active").order("company_name")
      .then(({data})=>setCustomers(data||[]));
    supabase.from("system_settings").select("timer_edit_mode,timer_edit_days").limit(1).single()
      .then(({data})=>{ if (data) setSysSettings(data); });
  },[]);

  const loadEntries = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({from:range.start.toISOString(), to:range.end.toISOString(), role:user.role});
      if (user.role==="employee") params.set("user_id", user.id);
      const res  = await fetch(`/api/time-entries?${params}`, { headers: await authHeader() });
      const json = await res.json();
      if (json.error) { toast.error(`שגיאה: ${json.error}`); return; }
      const data: Entry[] = json.data||[];

      const map = new Map<string, Entry[]>();
      for (const e of data) {
        const d = toLocalDate(e.start_time);
        if (!map.has(d)) map.set(d,[]);
        map.get(d)!.push(e);
      }
      const result: DayGroup[] = [];
      for (const [date, entries] of map) {
        result.push({ date, label:dateLabel(date), entries,
          totalSeconds: entries.reduce((s,e)=>s+(e.duration||0),0) });
      }
      result.sort((a,b)=>b.date.localeCompare(a.date));
      setGroups(result);
    } finally { setLoading(false); }
  };

  const periodTotal = groups.reduce((s,g)=>s+g.totalSeconds,0);

  const goPrev = () => {
    const d = new Date(base);
    if (period==="week")  d.setDate(d.getDate()-7);
    else                  d.setMonth(d.getMonth()-1);
    setBase(d);
  };
  const goNext = () => {
    const d = new Date(base);
    if (period==="week")  d.setDate(d.getDate()+7);
    else                  d.setMonth(d.getMonth()+1);
    setBase(d);
  };
  const goNow = () => setBase(new Date());

  // Nav label
  const navLabel = period==="week"
    ? `${range.start.getDate()} ${MONTHS_HE[range.start.getMonth()]} – ${range.end.getDate()} ${MONTHS_HE[range.end.getMonth()]} ${range.end.getFullYear()}`
    : `${MONTHS_HE[base.getMonth()]} ${base.getFullYear()}`;

  const periodLabel = period==="week" ? "השבוע" : "החודש";

  const handleDelete = async (id:string) => {
    const res = await fetch(`/api/time-entries?id=${id}`,{method:"DELETE", headers: await authHeader()});
    if (!res.ok) { toast.error("שגיאה במחיקה"); return; }
    toast.success("נמחק"); loadEntries();
  };
  const handleEdit = (entry:Entry) => {
    const s = isoToTime(entry.start_time);
    const e = entry.end_time ? isoToTime(entry.end_time) : "";
    setEditingId(entry.id);
    setEditNotes(entry.notes||"");
    setEditCustomer(entry.customer_id||"");
    setEditStart(s);
    setEditEnd(e);
    setEditDuration(entry.duration||0);
  };
  const handleSaveEdit = async (entry:Entry) => {
    const startISO = editStart ? applyTime(entry.start_time, editStart) : entry.start_time;
    const endISO   = editEnd   ? applyTime(entry.end_time||entry.start_time, editEnd) : entry.end_time;
    const dur = editEnd ? timeDiffSecs(entry.start_time, editStart, editEnd) : editDuration;
    const headers = { "Content-Type": "application/json", ...(await authHeader()) };
    const res = await fetch("/api/time-entries",{method:"PATCH",headers,
      body:JSON.stringify({id:entry.id,customer_id:editCustomer||null,task_id:entry.task_id,
        notes:editNotes,start_time:startISO,end_time:endISO,duration:dur})});
    if (!res.ok) { toast.error("שגיאה בעריכה"); return; }
    setEditingId(null); loadEntries();
  };
  const canEdit = (entry: Entry): boolean => {
    if (user?.role === "admin") return true;
    const mode = sysSettings.timer_edit_mode ?? "free";
    if (mode === "none") return false;
    if (mode === "days") {
      const days = sysSettings.timer_edit_days ?? 7;
      const diffMs = Date.now() - new Date(entry.start_time).getTime();
      return diffMs <= days * 86400 * 1000;
    }
    return true; // "free" or "approval"
  };

  const handleContinue = (entry:Entry) => {
    startTimer({customer_id:entry.customer_id||undefined, customer_name:entry.customer?.company_name,
      task_id:entry.task_id||undefined, task_title:entry.task?.title, project_id:entry.project_id||undefined});
    toast.success("טיימר הופעל");
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header title="טיימרים" />

      {/* Nav bar */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-3 flex items-center gap-3 flex-wrap">

        {/* Period toggle */}
        <div className="flex bg-[#f1f5f9] rounded-lg p-0.5 shrink-0">
          {(["week","month"] as Period[]).map(p=>(
            <button key={p} onClick={()=>{ setPeriod(p); setBase(new Date()); }}
              className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                period===p ? "bg-white shadow-sm text-[#0f172a]" : "text-[#64748b] hover:text-[#374151]")}>
              {p==="week" ? "שבוע" : "חודש"}
            </button>
          ))}
        </div>

        {/* Arrow navigation */}
        <div className="flex items-center gap-1">
          <button onClick={goPrev} className="p-1.5 rounded hover:bg-[#f1f5f9] text-[#64748b]">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-[#374151] min-w-[180px] text-center">{navLabel}</span>
          <button onClick={goNext} disabled={atCurrent} className="p-1.5 rounded hover:bg-[#f1f5f9] text-[#64748b] disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {!atCurrent && (
          <button onClick={goNow} className="text-xs text-[#16a34a] hover:underline font-medium">
            {period==="week" ? "השבוע הנוכחי" : "החודש הנוכחי"}
          </button>
        )}

        {/* Total */}
        <div className="mr-auto flex items-center gap-2 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-3 py-1.5">
          <Clock className="h-4 w-4 text-[#16a34a]" />
          <span className="text-sm font-bold text-[#16a34a]">{formatDurationSeconds(periodTotal)}</span>
          <span className="text-xs text-[#64748b]">{periodLabel}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-5 space-y-4">

        {/* Active timers banner */}
        {timers.length > 0 && (
          <div className="space-y-1">
            {timers.map(t => (
              <div key={t.id} className={`text-white rounded-xl px-5 py-3 flex items-center gap-3 ${t.is_paused ? "bg-yellow-500" : "bg-[#16a34a]"}`}>
                <div className={`w-2.5 h-2.5 rounded-full bg-white ${t.is_paused ? "" : "timer-pulse"}`} />
                <span className="font-mono font-bold text-lg">{formatDurationSeconds(getTimerDisplaySeconds(t))}</span>
                <span className="text-green-100 text-sm">
                  {t.customer_name||"ללא לקוח"}{t.task_title?` · ${t.task_title}`:""}
                </span>
                <span className="text-green-200 text-xs mr-auto">התחיל: {formatTimeOfDay(t.start_time)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Day-grouped entries */}
        {loading ? (
          <div className="space-y-4">{[1,2,3].map(i=><div key={i} className="skeleton rounded-xl h-28" />)}</div>
        ) : groups.length===0 ? (
          <div className="text-center py-20 text-[#94a3b8]">
            <Clock className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">אין רשומות זמן ב{periodLabel}</p>
            <p className="text-sm mt-1">הפעל טיימר כדי להתחיל לעקוב אחרי הזמן</p>
          </div>
        ) : groups.map(group => (
          <div key={group.date} className="bg-white rounded-xl shadow-sm border border-[#f1f5f9] overflow-hidden">
            {/* Day header */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-[#f8fafc] border-b border-[#f1f5f9]">
              <span className="font-semibold text-[#374151] text-sm">{group.label}</span>
              <span className="font-mono text-sm font-bold text-[#64748b]">
                סה"כ: {formatDurationSeconds(group.totalSeconds)}
              </span>
            </div>

            {/* Entries */}
            <div className="divide-y divide-[#f8fafc]">
              {group.entries.map(entry => (
                <div key={entry.id}>
                  {editingId===entry.id ? (
                    /* ── Edit panel ── */
                    <div className="px-5 py-4 bg-[#f8fffe] border-b border-[#e2e8f0]">
                      <div className="space-y-3">
                        {/* Row 1: notes + customer */}
                        <div className="flex gap-2 flex-wrap">
                          <input value={editNotes} onChange={e=>setEditNotes(e.target.value)}
                            placeholder="תיאור..." autoFocus
                            className="flex-1 min-w-[140px] border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                          <select value={editCustomer} onChange={e=>setEditCustomer(e.target.value)}
                            className="border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                            <option value="">ללא לקוח</option>
                            {customers.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}
                          </select>
                        </div>
                        {/* Row 2: times + duration + actions */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5 text-sm">
                            <span className="text-[#64748b] text-xs">התחלה</span>
                            <input type="time" value={editStart} dir="ltr"
                              onChange={e=>{
                                setEditStart(e.target.value);
                                setEditDuration(timeDiffSecs(entry.start_time,e.target.value,editEnd));
                              }}
                              className="border border-[#e2e8f0] rounded-lg px-2 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                          </label>
                          <label className="flex items-center gap-1.5 text-sm">
                            <span className="text-[#64748b] text-xs">סיום</span>
                            <input type="time" value={editEnd} dir="ltr"
                              onChange={e=>{
                                setEditEnd(e.target.value);
                                setEditDuration(timeDiffSecs(entry.start_time,editStart,e.target.value));
                              }}
                              className="border border-[#e2e8f0] rounded-lg px-2 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                          </label>
                          <span className="font-mono text-sm font-bold text-[#16a34a] mr-auto" dir="ltr">
                            {formatDurationSeconds(editDuration)}
                          </span>
                          <button onClick={()=>handleSaveEdit(entry)}
                            className="px-4 py-2 bg-[#16a34a] text-white rounded-lg text-sm font-medium hover:bg-[#15803d] transition-colors">
                            שמור
                          </button>
                          <button onClick={()=>setEditingId(null)}
                            className="px-3 py-2 text-[#64748b] hover:bg-[#f1f5f9] rounded-lg text-sm transition-colors">
                            ביטול
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal row ── */
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafafa] group">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#16a34a] opacity-60" />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm",entry.notes?"text-[#0f172a] font-medium":"text-[#94a3b8] italic")}>
                          {entry.notes||"ללא תיאור"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {entry.customer && <span className="text-xs font-medium text-[#16a34a]">{entry.customer.company_name}</span>}
                          {entry.task     && <span className="text-xs text-[#64748b]">· {entry.task.title}</span>}
                          {user?.role==="admin" && entry.user && <span className="text-xs text-[#94a3b8]">· {entry.user.full_name}</span>}
                        </div>
                      </div>
                      <div className="text-xs text-[#64748b] font-mono shrink-0 hidden sm:block" dir="ltr">
                        {formatTimeOfDay(entry.start_time)}
                        {entry.end_time && ` – ${formatTimeOfDay(entry.end_time)}`}
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#374151] w-20 text-left shrink-0" dir="ltr">
                        {formatDurationSeconds(entry.duration||0)}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={()=>handleContinue(entry)} title="המשך טיימר"
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-green-50 text-[#16a34a] transition-opacity">
                          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                        {canEdit(entry) && (
                          <button onClick={()=>handleEdit(entry)} title="ערוך"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-[#f1f5f9] text-[#64748b] transition-opacity">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit(entry) && (
                          <button onClick={()=>handleDelete(entry.id)} title="מחק"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-red-400 transition-opacity">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
