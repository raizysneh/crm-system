"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, Plus, Clock, CheckSquare, Users } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "task" | "meeting" | "attendance";
  color: string;
  time?: string;
  customer_name?: string;
}

export default function CalendarPage() {
  const { user } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    loadEvents();
  }, [month, year, user]);

  const loadEvents = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const startOfMonth = new Date(year, month, 1).toISOString();
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const result: CalendarEvent[] = [];

      // Load tasks due this month
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, due_date, customer:customers(company_name)")
        .not("due_date", "is", null)
        .gte("due_date", startOfMonth)
        .lte("due_date", endOfMonth)
        .neq("status", "completed");

      tasks?.forEach(t => {
        result.push({
          id: t.id,
          title: t.title,
          date: t.due_date.split("T")[0],
          type: "task",
          color: "#f59e0b",
          customer_name: (t.customer as any)?.company_name,
        });
      });

      // Load meetings
      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, title, start_time, customer:customers(company_name)")
        .gte("start_time", startOfMonth)
        .lte("start_time", endOfMonth);

      meetings?.forEach(m => {
        const d = new Date(m.start_time);
        result.push({
          id: m.id,
          title: m.title,
          date: d.toISOString().split("T")[0],
          type: "meeting",
          color: "#3b82f6",
          time: d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
          customer_name: (m.customer as any)?.company_name,
        });
      });

      setEvents(result);
    } catch { toast.error("שגיאה בטעינה"); }
    finally { setLoading(false); }
  };

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter(e => e.date === dateStr);
  };

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => { setCurrentDate(new Date()); setSelectedDay(new Date().getDate()); };

  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  // Build calendar grid (Sunday-first)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <Header title="לוח שנה" />
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-[#f1f5f9] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#f8fafc] text-[#64748b]">
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="text-center">
                <h2 className="font-bold text-[#0f172a] text-lg">{MONTHS_HE[month]} {year}</h2>
              </div>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#f8fafc] text-[#64748b]">
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 border-b border-[#f1f5f9]">
              {DAYS_HE.map(d => (
                <div key={d} className="text-center text-xs font-medium text-[#94a3b8] py-2">{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="min-h-[80px] border-b border-l border-[#f8fafc]" />;
                const dayEvents = getEventsForDay(day);
                const isToday = isCurrentMonth && today.getDate() === day;
                const isSelected = selectedDay === day;
                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "min-h-[80px] p-1.5 border-b border-l border-[#f8fafc] cursor-pointer transition-colors",
                      isSelected && "bg-[#f0fdf4]",
                      !isSelected && "hover:bg-[#f8fafc]"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mb-1",
                      isToday ? "bg-[#16a34a] text-white" : "text-[#374151]"
                    )}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map(ev => (
                        <div
                          key={ev.id}
                          className="text-[10px] px-1.5 py-0.5 rounded truncate text-white"
                          style={{ backgroundColor: ev.color }}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-[#94a3b8] px-1">+{dayEvents.length - 3} עוד</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Button onClick={goToday} variant="outline" className="w-full">היום</Button>

            {/* Legend */}
            <div className="bg-white rounded-xl border border-[#f1f5f9] p-4">
              <h3 className="font-semibold text-[#0f172a] mb-3 text-sm">מקרא</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                  <span className="text-sm text-[#64748b]">משימות לביצוע</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                  <span className="text-sm text-[#64748b]">פגישות</span>
                </div>
              </div>
            </div>

            {/* Selected day events */}
            {selectedDay && (
              <div className="bg-white rounded-xl border border-[#f1f5f9] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#f1f5f9]">
                  <h3 className="font-semibold text-[#0f172a] text-sm">
                    {selectedDay} {MONTHS_HE[month]}
                  </h3>
                </div>
                <div className="p-3">
                  {selectedDayEvents.length === 0 ? (
                    <p className="text-sm text-[#94a3b8] text-center py-4">אין אירועים ביום זה</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedDayEvents.map(ev => (
                        <div key={ev.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#f8fafc]">
                          <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: ev.color }} />
                          <div>
                            <p className="text-sm font-medium text-[#0f172a]">{ev.title}</p>
                            {ev.customer_name && <p className="text-xs text-[#64748b]">{ev.customer_name}</p>}
                            {ev.time && <p className="text-xs text-[#94a3b8]">{ev.time}</p>}
                            <Badge variant={ev.type === "task" ? "warning" : "info"} className="mt-1 text-[10px]">
                              {ev.type === "task" ? "משימה" : "פגישה"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* This month summary */}
            <div className="bg-white rounded-xl border border-[#f1f5f9] p-4">
              <h3 className="font-semibold text-[#0f172a] mb-3 text-sm">החודש</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#64748b] flex items-center gap-1.5">
                    <CheckSquare className="h-3.5 w-3.5 text-[#f59e0b]" /> משימות
                  </span>
                  <span className="font-semibold text-[#0f172a]">
                    {events.filter(e => e.type === "task").length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#64748b] flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-[#3b82f6]" /> פגישות
                  </span>
                  <span className="font-semibold text-[#0f172a]">
                    {events.filter(e => e.type === "meeting").length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
