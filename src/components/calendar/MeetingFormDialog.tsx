"use client";

import { useState, useEffect } from "react";
import { X, Calendar, Clock, MapPin, Link, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

interface Props {
  defaultDate?: string; // yyyy-mm-dd
  meeting?: any;
  onClose: () => void;
  onSave: () => void;
}

export default function MeetingFormDialog({ defaultDate, meeting, onClose, onSave }: Props) {
  const { user } = useAuthStore();
  const [title, setTitle]         = useState(meeting?.title || "");
  const [customerId, setCustomerId] = useState(meeting?.customer_id || "");
  const [date, setDate]           = useState(
    defaultDate || (meeting ? meeting.start_time.split("T")[0] : new Date().toISOString().split("T")[0])
  );
  const [startTime, setStartTime] = useState(
    meeting ? meeting.start_time.slice(11, 16) : "09:00"
  );
  const [endTime, setEndTime]     = useState(
    meeting ? meeting.end_time?.slice(11, 16) || "10:00" : "10:00"
  );
  const [location, setLocation]   = useState(meeting?.location || "");
  const [meetingLink, setMeetingLink] = useState(meeting?.meeting_link || "");
  const [notes, setNotes]         = useState(meeting?.notes || "");
  const [participantIds, setParticipantIds] = useState<string[]>(
    meeting?.participants?.map((p: any) => p.user?.id).filter(Boolean) || []
  );
  const [clients, setClients]     = useState<{ id: string; company_name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    supabase.from("customers").select("id,company_name").eq("status","active").then(({ data }) => setClients(data || []));
    supabase.from("users").select("id,full_name").eq("status","active").neq("role","client").then(({ data }) => setEmployees(data || []));
  }, []);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("נא להזין כותרת"); return; }
    setSaving(true);
    try {
      const startISO = `${date}T${startTime}:00`;
      const endISO   = `${date}T${endTime}:00`;

      if (meeting) {
        const res = await fetch("/api/meetings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: meeting.id, title, customer_id: customerId || null,
            start_time: startISO, end_time: endISO,
            location, meeting_link: meetingLink, notes,
            participant_ids: participantIds,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      } else {
        const res = await fetch("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, customer_id: customerId || null,
            start_time: startISO, end_time: endISO,
            location, meeting_link: meetingLink, notes,
            participant_ids: participantIds,
            created_by: user?.id,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      toast.success(meeting ? "הפגישה עודכנה" : "הפגישה נוצרה");
      onSave();
    } catch (e: any) {
      toast.error(e.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const toggleParticipant = (uid: string) =>
    setParticipantIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f1f5f9]">
          <h2 className="font-bold text-[#0f172a] text-lg">
            {meeting ? "עריכת פגישה" : "פגישה חדשה"}
          </h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#374151]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>כותרת *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת הפגישה" dir="rtl" autoFocus />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-1">
              <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> תאריך</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> התחלה</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> סיום</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} dir="ltr" />
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-1.5">
            <Label>לקוח (אופציונלי)</Label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:outline-none focus:border-[#16a34a] bg-white"
              dir="rtl"
            >
              <option value="">ללא לקוח</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> מיקום</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="כתובת, חדר ישיבות..." dir="rtl" />
          </div>

          {/* Meeting link */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><Link className="h-3.5 w-3.5" /> קישור לפגישה</Label>
            <Input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://zoom.us/..." dir="ltr" />
          </div>

          {/* Participants */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> משתתפים
              {participantIds.length > 0 && (
                <span className="text-xs bg-[#16a34a] text-white px-1.5 py-0.5 rounded-full">{participantIds.length}</span>
              )}
            </Label>
            <div className="border border-[#e2e8f0] rounded-lg max-h-32 overflow-y-auto divide-y divide-[#f8fafc]">
              {employees.map(emp => (
                <label key={emp.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#f8fafc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={participantIds.includes(emp.id)}
                    onChange={() => toggleParticipant(emp.id)}
                    className="w-4 h-4 accent-[#16a34a]"
                  />
                  <span className="text-sm text-[#0f172a]">{emp.full_name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>הערות</Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="הערות נוספות..."
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:outline-none focus:border-[#16a34a] resize-none"
              dir="rtl"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#f1f5f9] flex gap-3">
          <Button onClick={handleSave} loading={saving} className="flex-1">
            {meeting ? "שמור שינויים" : "צור פגישה"}
          </Button>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
        </div>
      </div>
    </div>
  );
}
