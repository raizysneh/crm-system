"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronRight, ChevronLeft, ChevronDown, MoreVertical, Plus, CheckSquare, Users,
  Clock, MapPin, Link as LinkIcon, Pencil, Trash2, CalendarDays,
  List, Grid3X3,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import MeetingFormDialog from "@/components/calendar/MeetingFormDialog";

const DAYS_HE   = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const DAYS_SHORT = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

type ViewMode = "month" | "week" | "agenda";

interface CalEvent {
  id: string;
  title: string;
  date: string;      // yyyy-mm-dd
  type: "task" | "meeting" | "overdue";
  color: string;
  time?: string;
  endTime?: string;
  customer_name?: string;
  location?: string;
  meeting_link?: string;
  notes?: string;
  raw?: any;
}

function fmt(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate()} ${MONTHS_HE[d.getMonth()]}`;
}

function toLocalDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function timeStr(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function generateRecurringInstances(m: any, rangeFrom: Date, rangeTo: Date): any[] {
  if (!m.is_recurring || !m.recurrence_type) return [m];

  const startDt  = new Date(m.start_time);
  const endDt    = m.end_time ? new Date(m.end_time) : null;
  const duration = endDt ? endDt.getTime() - startDt.getTime() : 0;
  const interval = Math.max(1, m.recurrence_interval || 1);
  const maxCount = m.recurrence_end_type === "count" ? Math.min(m.recurrence_end_count || 100, 500) : 500;
  const seriesEnd = m.recurrence_end_type === "date" && m.recurrence_end_date
    ? new Date(m.recurrence_end_date + "T23:59:59") : null;

  const instances: any[] = [];
  let current = new Date(startDt);
  let count = 0;

  while (count < maxCount && current <= rangeTo) {
    if (seriesEnd && current > seriesEnd) break;
    if (current >= rangeFrom) {
      const instEnd = endDt ? new Date(current.getTime() + duration) : null;
      instances.push({
        ...m,
        start_time: current.toISOString(),
        end_time: instEnd?.toISOString() || m.end_time,
      });
    }
    count++;
    switch (m.recurrence_type) {
      case "daily":   current.setDate(current.getDate() + interval); break;
      case "weekly":  current.setDate(current.getDate() + 7 * interval); break;
      case "monthly": current.setMonth(current.getMonth() + interval); break;
      case "yearly":  current.setFullYear(current.getFullYear() + interval); break;
      case "custom":  current.setDate(current.getDate() + interval); break;
      default: return instances.length ? instances : [m];
    }
  }
  return instances.length ? instances : [];
}

export default function CalendarPage() {
  const { user } = useAuthStore();
  const [viewMode, setViewMode]         = useState<ViewMode>("month");
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [events, setEvents]             = useState<CalEvent[]>([]);
  const [selectedDay, setSelectedDay]   = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [editMeeting, setEditMeeting]   = useState<any>(null);
  const [formDefaultDate, setFormDefaultDate] = useState<string | undefined>();
  const [employees, setEmployees]       = useState<{id:string; full_name:string}[]>([]);
  const [filterEmployee, setFilterEmployee] = useState("me");
  const [dragEvent, setDragEvent]       = useState<CalEvent | null>(null);
  const [showLegend, setShowLegend]     = useState(false);
  const [sidebarMode, setSidebarMode]   = useState<"pinned" | "floating">("pinned");
  const [floatPos, setFloatPos]         = useState({ x: 20, y: 100 });
  const [showSidebarMenu, setShowSidebarMenu] = useState(false);
  const dragState = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    if (user?.role === "admin") {
      supabase.from("users").select("id,full_name").in("role",["admin","employee"]).eq("status","active")
        .then(({ data }) => setEmployees(data || []));
    }
  }, [user]);

  useEffect(() => { loadEvents(); }, [month, year, user, filterEmployee]);

  const loadEvents = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Range: ±2 months for week/agenda views
      const from = new Date(year, month - 1, 1).toISOString();
      const to   = new Date(year, month + 2, 0, 23, 59, 59).toISOString();

      const result: CalEvent[] = [];
      const today = toYMD(new Date());

      // Tasks due in range — filter by employee
      let taskQuery = supabase
        .from("tasks")
        .select("id,title,due_date,status,assigned_user_id,customer:customers(company_name)")
        .not("due_date","is",null)
        .gte("due_date", from)
        .lte("due_date", to)
        .neq("status","completed")
        .neq("status","cancelled");

      if (user.role === "employee") {
        taskQuery = taskQuery.eq("assigned_user_id", user.id);
      } else if (filterEmployee === "me") {
        taskQuery = taskQuery.eq("assigned_user_id", user.id);
      } else if (filterEmployee !== "all") {
        taskQuery = taskQuery.eq("assigned_user_id", filterEmployee);
      }

      const { data: tasks } = await taskQuery;

      tasks?.forEach(t => {
        const d = t.due_date.split("T")[0];
        const overdue = d < today;
        result.push({
          id: t.id, title: t.title, date: d, type: overdue ? "overdue" : "task",
          color: overdue ? "#ef4444" : "#f59e0b",
          customer_name: (t.customer as any)?.company_name,
        });
      });

      // Meetings in range (+ older recurring ones from API)
      const res = await fetch(`/api/meetings?from=${from}&to=${to}`);
      const json = await res.json();
      const targetId = filterEmployee === "me" ? user.id : filterEmployee === "all" ? null : filterEmployee;
      const rangeFromDt = new Date(from);
      const rangeToDt   = new Date(to);
      (json.data || [])
        .filter((m: any) => {
          if (!targetId) return true;
          const participantIds: string[] = (m.participants || []).map((p: any) => p.user?.id).filter(Boolean);
          return m.created_by === targetId || participantIds.includes(targetId);
        })
        .forEach((m: any) => {
          const instances = generateRecurringInstances(m, rangeFromDt, rangeToDt);
          instances.forEach((inst, idx) => {
            result.push({
              id: inst.is_recurring ? `${m.id}_${idx}` : m.id,
              title: inst.title,
              date: toLocalDate(inst.start_time),
              type: "meeting", color: "#3b82f6",
              time: timeStr(inst.start_time),
              endTime: inst.end_time ? timeStr(inst.end_time) : undefined,
              customer_name: inst.customer?.company_name,
              location: inst.location,
              meeting_link: inst.meeting_link,
              notes: inst.notes,
              raw: m, // always point to original for edit/delete
            });
          });
        });

      setEvents(result);
    } catch { toast.error("שגיאה בטעינה"); }
    finally { setLoading(false); }
  };

  const getEventsForDay = (dateStr: string) => events.filter(e => e.date === dateStr);

  const handleDropOnDay = async (newDate: string) => {
    if (!dragEvent) return;
    if (dragEvent.date === newDate) { setDragEvent(null); return; }
    if (dragEvent.type === "meeting") {
      const m = dragEvent.raw;
      const oldStart = new Date(m.start_time);
      const oldEnd   = m.end_time ? new Date(m.end_time) : null;
      const diff     = oldEnd ? oldEnd.getTime() - oldStart.getTime() : 0;
      const [y,mo,d] = newDate.split("-").map(Number);
      const newStart = new Date(oldStart); newStart.setFullYear(y,mo-1,d);
      const newEnd   = oldEnd ? new Date(newStart.getTime() + diff) : null;
      await fetch("/api/meetings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, start_time: newStart.toISOString(), end_time: newEnd?.toISOString() }),
      });
      toast.success("הפגישה הועברה");
      loadEvents();
    } else {
      // For tasks — update due_date
      await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dragEvent.id, due_date: newDate }),
      });
      toast.success("תאריך המשימה עודכן");
      loadEvents();
    }
    setDragEvent(null);
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm("למחוק פגישה זו?")) return;
    const res = await fetch(`/api/meetings?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("הפגישה נמחקה"); loadEvents(); }
    else toast.error("שגיאה במחיקה");
  };

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { ox: e.clientX - floatPos.x, oy: e.clientY - floatPos.y, px: floatPos.x, py: floatPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setFloatPos({ x: ev.clientX - dragState.current.ox, y: ev.clientY - dragState.current.oy });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Month view ──────────────────────────────────────────────────────────────

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = toYMD(new Date());

  // ── Week view ───────────────────────────────────────────────────────────────

  const getWeekDays = () => {
    const d = new Date(currentDate);
    const day = d.getDay();
    d.setDate(d.getDate() - day); // Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(d);
      dd.setDate(d.getDate() + i);
      return toYMD(dd);
    });
  };
  const weekDays = getWeekDays();

  // ── Agenda view ─────────────────────────────────────────────────────────────

  const getAgendaDays = () => {
    const days: string[] = [];
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const s = toYMD(new Date(d));
      if (events.some(e => e.date === s)) days.push(s);
    }
    return days;
  };

  const nav = (dir: number) => {
    if (viewMode === "week") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + dir * 7);
      setCurrentDate(d);
    } else {
      setCurrentDate(new Date(year, month + dir, 1));
    }
  };

  const headerLabel = () => {
    if (viewMode === "week") {
      const w = weekDays;
      return `${fmt(w[0])} – ${fmt(w[6])} ${year}`;
    }
    return `${MONTHS_HE[month]} ${year}`;
  };

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  const EventChip = ({ ev, compact = false }: { ev: CalEvent; compact?: boolean }) => {
    const chip = (
      <div
        draggable
        onDragStart={e => { e.stopPropagation(); setDragEvent(ev); }}
        onDragEnd={() => setDragEvent(null)}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5 text-white hover:opacity-90 transition-opacity cursor-grab active:cursor-grabbing",
          compact ? "text-[11px]" : "text-[13px]"
        )}
        style={{ backgroundColor: ev.color }}
        onClick={e => { e.stopPropagation(); setSelectedDay(ev.date); }}
      >
        {ev.time && <span className="opacity-80">{ev.time}</span>}
        <span className="truncate font-medium">{ev.title}</span>
      </div>
    );
    if (ev.type === "task" || ev.type === "overdue") {
      return <Link href={`/tasks/${ev.id}`} onClick={e => e.stopPropagation()}>{chip}</Link>;
    }
    return chip;
  };

  const DropCell = ({ dateStr, children, className }: { dateStr: string; children: React.ReactNode; className?: string }) => (
    <div
      className={cn(className, dragEvent && "ring-2 ring-inset ring-[#16a34a]/30")}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); handleDropOnDay(dateStr); }}
    >
      {children}
    </div>
  );

  return (
    <div>
      <Header title="לוח שנה" />
      <div className="p-6 space-y-4">

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* View mode */}
            <div className="flex items-center border border-[#e2e8f0] rounded-lg overflow-hidden bg-white">
              {([
                { k: "month" as ViewMode, label: "חודש", icon: <Grid3X3 className="h-4 w-4" /> },
                { k: "week"  as ViewMode, label: "שבוע",  icon: <CalendarDays className="h-4 w-4" /> },
                { k: "agenda" as ViewMode, label: "סדר יום", icon: <List className="h-4 w-4" /> },
              ] as const).map(({ k, label, icon }) => (
                <button key={k} onClick={() => setViewMode(k)}
                  className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                    viewMode === k ? "bg-[#16a34a] text-white" : "text-[#64748b] hover:bg-[#f8fafc]")}>
                  {icon}{label}
                </button>
              ))}
            </div>

            {/* Nav */}
            <button onClick={() => nav(-1)} className="p-1.5 rounded-lg hover:bg-[#f8fafc] border border-[#e2e8f0]">
              <ChevronRight className="h-4 w-4 text-[#64748b]" />
            </button>
            <button onClick={() => nav(1)} className="p-1.5 rounded-lg hover:bg-[#f8fafc] border border-[#e2e8f0]">
              <ChevronLeft className="h-4 w-4 text-[#64748b]" />
            </button>
            <button onClick={() => { setCurrentDate(new Date()); setSelectedDay(todayStr); }}
              className="px-3 py-1.5 text-sm border border-[#e2e8f0] rounded-lg hover:bg-[#f8fafc] text-[#374151]">
              היום
            </button>

            <span className="font-bold text-[#0f172a] text-base">{headerLabel()}</span>
          </div>

          <div className="flex items-center gap-2">
            {user?.role === "admin" && (
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="w-44 text-sm">
                  <SelectValue placeholder="הצג יומן של" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">היומן שלי</SelectItem>
                  <SelectItem value="all">כולם</SelectItem>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => { setEditMeeting(null); setFormDefaultDate(selectedDay || todayStr); setShowMeetingForm(true); }}>
              <Plus className="h-4 w-4" /> פגישה חדשה
            </Button>
          </div>
        </div>

        <div className={cn("grid grid-cols-1 gap-4", sidebarMode === "pinned" && "lg:grid-cols-4")}>

          {/* ── Calendar grid ── */}
          <div className={cn("bg-white rounded-xl shadow-sm border border-[#f1f5f9] overflow-hidden", sidebarMode === "pinned" && "lg:col-span-3")}>

            {/* ── MONTH view ── */}
            {viewMode === "month" && (
              <>
                <div className="grid grid-cols-7 border-b border-[#f1f5f9] bg-gradient-to-b from-[#f8fafc] to-white">
                  {DAYS_HE.map((d, i) => (
                    <div key={d} className={cn(
                      "text-center text-sm font-bold py-3 tracking-wide",
                      i === 6 ? "text-red-400" : i === 5 ? "text-blue-400" : "text-[#64748b]"
                    )}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((dateStr, idx) => {
                    if (!dateStr) return <div key={`e${idx}`} className="min-h-[90px] border-b border-l border-[#f1f5f9] bg-[#f8fafc]/60" />;
                    const dayEvs = getEventsForDay(dateStr);
                    const isToday    = dateStr === todayStr;
                    const isSelected = dateStr === selectedDay;
                    const day = parseInt(dateStr.split("-")[2]);
                    return (
                      <DropCell key={dateStr} dateStr={dateStr}
                        className={cn(
                          "min-h-[100px] p-1.5 border-b border-l border-[#f1f5f9] cursor-pointer transition-colors group/cell",
                          isSelected ? "bg-[#f0fdf4]" : "hover:bg-[#f8fafc]"
                        )}
                      ><div onClick={() => setSelectedDay(dateStr)}>
                        <div className="flex items-center justify-between mb-1">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold",
                              isToday ? "bg-[#16a34a] text-white" : "text-[#374151]"
                            )}
                            onClick={e => { e.stopPropagation(); setFormDefaultDate(dateStr); setEditMeeting(null); setShowMeetingForm(true); }}
                            title="פגישה חדשה בתאריך זה"
                          >{day}</div>
                          <button
                            onClick={e => { e.stopPropagation(); setFormDefaultDate(dateStr); setEditMeeting(null); setShowMeetingForm(true); }}
                            className="opacity-0 group-hover/cell:opacity-100 transition-opacity w-4 h-4 rounded-full bg-[#16a34a] text-white flex items-center justify-center text-[10px] font-bold hover:bg-[#15803d]"
                            title="פגישה חדשה"
                          >+</button>
                        </div>
                        <div className="space-y-0.5">
                          {dayEvs.slice(0, 3).map(ev => <EventChip key={ev.id} ev={ev} compact />)}
                          {dayEvs.length > 3 && (
                            <div className="text-[9px] text-[#94a3b8] px-1">+{dayEvs.length - 3} עוד</div>
                          )}
                        </div>
                      </div></DropCell>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── WEEK view ── */}
            {viewMode === "week" && (
              <>
                <div className="grid grid-cols-7 border-b border-[#f1f5f9]">
                  {weekDays.map((dateStr, i) => {
                    const isToday = dateStr === todayStr;
                    const day = parseInt(dateStr.split("-")[2]);
                    return (
                      <div key={dateStr} className="text-center py-3 border-l border-[#f8fafc]">
                        <div className="text-sm text-[#64748b] mb-1">{DAYS_SHORT[i]}</div>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center mx-auto text-sm font-bold",
                          isToday ? "bg-[#16a34a] text-white" : "text-[#0f172a]"
                        )}>{day}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 min-h-[400px]">
                  {weekDays.map(dateStr => {
                    const dayEvs = getEventsForDay(dateStr);
                    const isSelected = dateStr === selectedDay;
                    return (
                      <DropCell key={dateStr} dateStr={dateStr}
                        className={cn(
                          "border-l border-[#f8fafc] p-2 space-y-1 cursor-pointer hover:bg-[#f8fafc] transition-colors",
                          isSelected && "bg-[#f0fdf4]"
                        )}>
                        <div onClick={() => setSelectedDay(dateStr)} className="min-h-full">
                          {dayEvs.map(ev => <EventChip key={ev.id} ev={ev} />)}
                          {dayEvs.length === 0 && (
                            <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100">
                              <Plus className="h-4 w-4 text-[#94a3b8]" />
                            </div>
                          )}
                        </div>
                      </DropCell>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── AGENDA view ── */}
            {viewMode === "agenda" && (
              <div className="divide-y divide-[#f8fafc]">
                {loading ? (
                  <div className="p-8 text-center text-[#94a3b8]">טוען...</div>
                ) : getAgendaDays().length === 0 ? (
                  <div className="p-12 text-center text-[#94a3b8]">
                    <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>אין אירועים החודש</p>
                  </div>
                ) : getAgendaDays().map(dateStr => {
                  const dayEvs = getEventsForDay(dateStr).sort((a,b) => (a.time||"").localeCompare(b.time||""));
                  return (
                    <div key={dateStr} className="flex gap-4 p-4 hover:bg-[#f8fafc]">
                      <div className="w-24 shrink-0 text-right">
                        <div className={cn("font-bold text-sm",
                          dateStr === todayStr ? "text-[#16a34a]" : "text-[#0f172a]"
                        )}>
                          {DAYS_HE[new Date(dateStr+"T12:00:00").getDay()]}
                        </div>
                        <div className="text-xs text-[#94a3b8]">
                          {new Date(dateStr+"T12:00:00").getDate()} {MONTHS_HE[new Date(dateStr+"T12:00:00").getMonth()]}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        {dayEvs.map(ev => (
                          <div key={ev.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-[#f1f5f9] hover:border-[#e2e8f0]">
                            <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: ev.color }} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {(ev.type === "task" || ev.type === "overdue") ? (
                                  <Link href={`/tasks/${ev.id}`} className="font-medium text-sm text-[#0f172a] hover:text-[#16a34a] hover:underline">{ev.title}</Link>
                                ) : (
                                  <span className="font-medium text-sm text-[#0f172a]">{ev.title}</span>
                                )}
                                {ev.time && <span className="text-xs text-[#64748b]">{ev.time}{ev.endTime ? `–${ev.endTime}` : ""}</span>}
                              </div>
                              {ev.customer_name && <p className="text-xs text-[#64748b] mt-0.5">{ev.customer_name}</p>}
                              {ev.location && <p className="text-xs text-[#94a3b8] flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{ev.location}</p>}
                            </div>
                            {ev.type === "meeting" && user?.role === "admin" && (
                              <div className="flex gap-1">
                                <button onClick={() => { setEditMeeting(ev.raw); setShowMeetingForm(true); }}
                                  className="p-1 rounded hover:bg-[#f1f5f9] text-[#64748b]"><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => handleDeleteMeeting(ev.id)}
                                  className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div
            className={cn(
              sidebarMode === "pinned"
                ? "space-y-3"
                : "fixed z-50 w-[260px] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] overflow-hidden"
            )}
            style={sidebarMode === "floating" ? { left: floatPos.x, top: floatPos.y } : undefined}
          >
            {sidebarMode === "floating" && (
              <div
                onMouseDown={onDragStart}
                className="flex items-center justify-between px-3 py-2.5 bg-[#0f172a] cursor-grab active:cursor-grabbing select-none border-b border-white/5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-white/25 text-sm tracking-widest">⠿⠿</span>
                  <span className="text-[11px] font-bold text-white/60 uppercase tracking-wide">לוח צד</span>
                </div>
                <div className="relative">
                  <button onClick={e => { e.stopPropagation(); setShowSidebarMenu(v => !v); }}
                    className="p-1 rounded hover:bg-white/10 text-white/50 transition-colors">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {showSidebarMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowSidebarMenu(false)} />
                      <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-[#e2e8f0] z-20 overflow-hidden" dir="rtl">
                        <button onClick={() => { setSidebarMode("pinned"); setShowSidebarMenu(false); }}
                          className="w-full text-right px-3 py-2.5 text-sm text-[#374151] hover:bg-[#f8fafc] flex items-center gap-2.5 transition-colors">
                          📌 הצמד ללוח
                        </button>
                        <button onClick={() => setShowSidebarMenu(false)}
                          className="w-full text-right px-3 py-2.5 text-sm hover:bg-[#f8fafc] flex items-center gap-2.5 border-t border-[#f8fafc] font-semibold text-[#16a34a] transition-colors">
                          ✓ רחף
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className={cn(sidebarMode === "floating" ? "p-3 space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto" : "space-y-3")}>
            {sidebarMode === "pinned" && (
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8]">לוח צד</span>
                <div className="relative">
                  <button onClick={e => { e.stopPropagation(); setShowSidebarMenu(v => !v); }}
                    className="p-1 rounded hover:bg-[#e2e8f0] text-[#94a3b8] transition-colors">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                  {showSidebarMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowSidebarMenu(false)} />
                      <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-[#e2e8f0] z-20 overflow-hidden" dir="rtl">
                        <button onClick={() => setShowSidebarMenu(false)}
                          className="w-full text-right px-3 py-2.5 text-sm hover:bg-[#f8fafc] flex items-center gap-2.5 font-semibold text-[#16a34a] transition-colors">
                          ✓ מוצמד ללוח
                        </button>
                        <button onClick={() => { setSidebarMode("floating"); setShowSidebarMenu(false); setFloatPos({ x: 20, y: 100 }); }}
                          className="w-full text-right px-3 py-2.5 text-sm text-[#374151] hover:bg-[#f8fafc] flex items-center gap-2.5 border-t border-[#f8fafc] transition-colors">
                          🪟 רחף
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Legend — collapsible */}
            <div className="bg-white rounded-xl border border-[#f1f5f9] overflow-hidden">
              <button
                onClick={() => setShowLegend(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f8fafc] transition-colors"
              >
                <span className="font-semibold text-[#0f172a] text-sm">מקרא</span>
                <ChevronDown className={cn("h-4 w-4 text-[#94a3b8] transition-transform duration-200", showLegend && "rotate-180")} />
              </button>
              {showLegend && (
                <div className="border-t border-[#f1f5f9] px-4 py-3 space-y-2">
                  {[
                    { color:"#f59e0b", label:"משימות לביצוע" },
                    { color:"#ef4444", label:"משימות באיחור" },
                    { color:"#3b82f6", label:"פגישות" },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[#64748b]">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Month stats — compact horizontal */}
            <div className="bg-white rounded-xl border border-[#f1f5f9] p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2 px-1">סיכום חודש</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { color:"#f59e0b", label:"משימות", count: events.filter(e=>e.type==="task").length },
                  { color:"#ef4444", label:"באיחור",  count: events.filter(e=>e.type==="overdue").length },
                  { color:"#3b82f6", label:"פגישות",  count: events.filter(e=>e.type==="meeting").length },
                ].map(({ color, label, count }) => (
                  <div key={label} className="flex flex-col items-center py-2 rounded-lg bg-[#f8fafc] border border-[#f1f5f9]">
                    <span className="text-xl font-bold text-[#0f172a] leading-none">{count}</span>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[10px] text-[#64748b]">{label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected day panel */}
            {selectedDay && (
              <div className="bg-white rounded-xl border border-[#f1f5f9] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
                  <h3 className="font-semibold text-[#0f172a] text-sm">
                    {DAYS_HE[new Date(selectedDay+"T12:00:00").getDay()]}, {fmt(selectedDay)}
                  </h3>
                  <button
                    onClick={() => { setEditMeeting(null); setFormDefaultDate(selectedDay); setShowMeetingForm(true); }}
                    className="text-[#16a34a] hover:bg-[#f0fdf4] p-1 rounded" title="פגישה חדשה">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-3">
                  {selectedEvents.length === 0 ? (
                    <p className="text-sm text-[#94a3b8] text-center py-4">אין אירועים</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents
                        .sort((a,b) => (a.time||"").localeCompare(b.time||""))
                        .map(ev => (
                          <div key={ev.id} className="p-2.5 rounded-lg border border-[#f1f5f9] hover:border-[#e2e8f0]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2">
                                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: ev.color }} />
                                <div>
                                  {(ev.type === "task" || ev.type === "overdue") ? (
                                    <Link href={`/tasks/${ev.id}`} className="text-sm font-medium text-[#0f172a] hover:text-[#16a34a] hover:underline">{ev.title}</Link>
                                  ) : (
                                    <p className="text-sm font-medium text-[#0f172a]">{ev.title}</p>
                                  )}
                                  {ev.time && (
                                    <p className="text-xs text-[#64748b] flex items-center gap-1 mt-0.5">
                                      <Clock className="h-3 w-3" />{ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}
                                    </p>
                                  )}
                                  {ev.customer_name && <p className="text-xs text-[#94a3b8] mt-0.5">{ev.customer_name}</p>}
                                  {ev.location && (
                                    <p className="text-xs text-[#94a3b8] flex items-center gap-1 mt-0.5">
                                      <MapPin className="h-3 w-3" />{ev.location}
                                    </p>
                                  )}
                                  {ev.meeting_link && (
                                    <a href={ev.meeting_link} target="_blank" rel="noopener noreferrer"
                                      className="text-xs text-blue-500 flex items-center gap-1 mt-0.5 hover:underline">
                                      <LinkIcon className="h-3 w-3" />קישור לפגישה
                                    </a>
                                  )}
                                </div>
                              </div>
                              {ev.type === "meeting" && user?.role === "admin" && (
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => { setEditMeeting(ev.raw); setShowMeetingForm(true); }}
                                    className="p-1 rounded hover:bg-[#f1f5f9] text-[#64748b]"><Pencil className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => handleDeleteMeeting(ev.id)}
                                    className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              )}
                            </div>
                            {ev.notes && <p className="text-xs text-[#94a3b8] mt-1.5 pr-4">{ev.notes}</p>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {showMeetingForm && (
        <MeetingFormDialog
          defaultDate={formDefaultDate}
          meeting={editMeeting}
          onClose={() => { setShowMeetingForm(false); setEditMeeting(null); }}
          onSave={() => { setShowMeetingForm(false); setEditMeeting(null); loadEvents(); }}
        />
      )}
    </div>
  );
}
