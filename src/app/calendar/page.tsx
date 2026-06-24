"use client";

import { useState, useEffect } from "react";
import {
  ChevronRight, ChevronLeft, Plus, CheckSquare, Users,
  Clock, MapPin, Link as LinkIcon, Pencil, Trash2, CalendarDays,
  List, Grid3X3,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => { loadEvents(); }, [month, year, user]);

  const loadEvents = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Range: ±2 months for week/agenda views
      const from = new Date(year, month - 1, 1).toISOString();
      const to   = new Date(year, month + 2, 0, 23, 59, 59).toISOString();

      const result: CalEvent[] = [];
      const today = toYMD(new Date());

      // Tasks due in range
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id,title,due_date,status,customer:customers(company_name)")
        .not("due_date","is",null)
        .gte("due_date", from)
        .lte("due_date", to)
        .neq("status","completed")
        .neq("status","cancelled");

      tasks?.forEach(t => {
        const d = t.due_date.split("T")[0];
        const overdue = d < today;
        result.push({
          id: t.id, title: t.title, date: d, type: overdue ? "overdue" : "task",
          color: overdue ? "#ef4444" : "#f59e0b",
          customer_name: (t.customer as any)?.company_name,
        });
      });

      // Meetings in range
      const res = await fetch(`/api/meetings?from=${from}&to=${to}`);
      const json = await res.json();
      (json.data || []).forEach((m: any) => {
        result.push({
          id: m.id, title: m.title,
          date: toLocalDate(m.start_time),
          type: "meeting", color: "#3b82f6",
          time: timeStr(m.start_time),
          endTime: m.end_time ? timeStr(m.end_time) : undefined,
          customer_name: m.customer?.company_name,
          location: m.location,
          meeting_link: m.meeting_link,
          notes: m.notes,
          raw: m,
        });
      });

      setEvents(result);
    } catch { toast.error("שגיאה בטעינה"); }
    finally { setLoading(false); }
  };

  const getEventsForDay = (dateStr: string) => events.filter(e => e.date === dateStr);

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm("למחוק פגישה זו?")) return;
    const res = await fetch(`/api/meetings?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("הפגישה נמחקה"); loadEvents(); }
    else toast.error("שגיאה במחיקה");
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

  const EventChip = ({ ev, compact = false }: { ev: CalEvent; compact?: boolean }) => (
    <div
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-white cursor-pointer hover:opacity-90 transition-opacity",
        compact ? "text-[9px]" : "text-[11px]"
      )}
      style={{ backgroundColor: ev.color }}
      onClick={e => { e.stopPropagation(); setSelectedDay(ev.date); }}
    >
      {ev.time && <span className="opacity-80">{ev.time}</span>}
      <span className="truncate font-medium">{ev.title}</span>
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

          <Button onClick={() => { setEditMeeting(null); setFormDefaultDate(selectedDay || todayStr); setShowMeetingForm(true); }}>
            <Plus className="h-4 w-4" /> פגישה חדשה
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* ── Calendar grid ── */}
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-[#f1f5f9] overflow-hidden">

            {/* ── MONTH view ── */}
            {viewMode === "month" && (
              <>
                <div className="grid grid-cols-7 border-b border-[#f1f5f9] bg-[#f8fafc]">
                  {DAYS_HE.map(d => (
                    <div key={d} className="text-center text-xs font-semibold text-[#64748b] py-2.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((dateStr, idx) => {
                    if (!dateStr) return <div key={`e${idx}`} className="min-h-[90px] border-b border-l border-[#f8fafc] bg-[#fafafa]" />;
                    const dayEvs = getEventsForDay(dateStr);
                    const isToday    = dateStr === todayStr;
                    const isSelected = dateStr === selectedDay;
                    const day = parseInt(dateStr.split("-")[2]);
                    return (
                      <div key={dateStr} onClick={() => setSelectedDay(dateStr)}
                        className={cn(
                          "min-h-[90px] p-1.5 border-b border-l border-[#f8fafc] cursor-pointer transition-colors",
                          isSelected ? "bg-[#f0fdf4]" : "hover:bg-[#f8fafc]"
                        )}>
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1",
                          isToday ? "bg-[#16a34a] text-white" : "text-[#374151]"
                        )}>{day}</div>
                        <div className="space-y-0.5">
                          {dayEvs.slice(0, 3).map(ev => <EventChip key={ev.id} ev={ev} compact />)}
                          {dayEvs.length > 3 && (
                            <div className="text-[9px] text-[#94a3b8] px-1">+{dayEvs.length - 3} עוד</div>
                          )}
                        </div>
                      </div>
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
                        <div className="text-xs text-[#64748b] mb-1">{DAYS_SHORT[i]}</div>
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
                      <div key={dateStr}
                        onClick={() => setSelectedDay(dateStr)}
                        className={cn(
                          "border-l border-[#f8fafc] p-2 space-y-1 cursor-pointer hover:bg-[#f8fafc] transition-colors",
                          isSelected && "bg-[#f0fdf4]"
                        )}>
                        {dayEvs.map(ev => <EventChip key={ev.id} ev={ev} />)}
                        {dayEvs.length === 0 && (
                          <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100">
                            <Plus className="h-4 w-4 text-[#94a3b8]" />
                          </div>
                        )}
                      </div>
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
                                <span className="font-medium text-sm text-[#0f172a]">{ev.title}</span>
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
          <div className="space-y-4">

            {/* Legend */}
            <div className="bg-white rounded-xl border border-[#f1f5f9] p-4">
              <h3 className="font-semibold text-[#0f172a] mb-3 text-sm">מקרא</h3>
              <div className="space-y-1.5 text-sm">
                {[
                  { color:"#f59e0b", label:"משימות לביצוע" },
                  { color:"#ef4444", label:"משימות באיחור" },
                  { color:"#3b82f6", label:"פגישות" },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[#64748b]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Month stats */}
            <div className="bg-white rounded-xl border border-[#f1f5f9] p-4">
              <h3 className="font-semibold text-[#0f172a] mb-3 text-sm">סיכום חודש</h3>
              <div className="space-y-2">
                {[
                  { icon:<CheckSquare className="h-3.5 w-3.5 text-[#f59e0b]" />, label:"משימות", count: events.filter(e=>e.type==="task").length },
                  { icon:<CheckSquare className="h-3.5 w-3.5 text-red-500"   />, label:"באיחור",  count: events.filter(e=>e.type==="overdue").length },
                  { icon:<Users       className="h-3.5 w-3.5 text-blue-500"  />, label:"פגישות",  count: events.filter(e=>e.type==="meeting").length },
                ].map(({ icon, label, count }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-[#64748b] flex items-center gap-1.5">{icon}{label}</span>
                    <span className="font-bold text-[#0f172a]">{count}</span>
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
                                  <p className="text-sm font-medium text-[#0f172a]">{ev.title}</p>
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
