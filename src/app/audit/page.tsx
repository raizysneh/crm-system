"use client";

import { useState, useEffect } from "react";
import { History, Search, Filter, ChevronRight, ChevronLeft, User, RefreshCw } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { formatDate, cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_value?: any;
  new_value?: any;
  created_at: string;
  user?: { id: string; full_name: string; email: string };
}

const ACTION_LABELS: Record<string, string> = {
  create: "יצירה", update: "עדכון", delete: "מחיקה",
  login: "כניסה", logout: "יציאה", status_change: "שינוי סטטוס",
  assign: "הקצאה", complete: "השלמה", approve: "אישור", reject: "דחייה",
};

const ENTITY_LABELS: Record<string, string> = {
  task: "משימה", project: "פרויקט", customer: "לקוח", user: "משתמש",
  time_entry: "שעות עבודה", attendance: "נוכחות", document: "מסמך",
  meeting: "פגישה", chat_message: "הודעת צאט",
};

const ACTION_COLORS: Record<string, string> = {
  create:        "bg-green-100 text-green-700",
  update:        "bg-blue-100 text-blue-700",
  delete:        "bg-red-100 text-red-700",
  login:         "bg-gray-100 text-gray-600",
  logout:        "bg-gray-100 text-gray-600",
  status_change: "bg-yellow-100 text-yellow-700",
  assign:        "bg-purple-100 text-purple-700",
  complete:      "bg-emerald-100 text-emerald-700",
  approve:       "bg-teal-100 text-teal-700",
  reject:        "bg-orange-100 text-orange-700",
};

export default function AuditPage() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [users, setUsers]       = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    user_id:     "",
    entity_type: "",
    from:        "",
    to:          "",
  });

  const LIMIT = 50;

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") { router.push("/dashboard"); return; }
    supabase.from("users").select("id, full_name").then(({ data }) => setUsers(data || []));
  }, [user]);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [page, filters]);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filters.user_id)     params.set("user_id",     filters.user_id);
    if (filters.entity_type) params.set("entity_type", filters.entity_type);
    if (filters.from)        params.set("from",        filters.from);
    if (filters.to)          params.set("to",          filters.to);

    const res  = await fetch(`/api/audit?${params}`);
    const json = await res.json();
    setEntries(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const renderDiff = (entry: AuditEntry) => {
    if (!entry.old_value && !entry.new_value) return null;
    const allKeys = new Set([
      ...Object.keys(entry.old_value || {}),
      ...Object.keys(entry.new_value || {}),
    ]);
    const changes: { key: string; old: any; new: any }[] = [];
    allKeys.forEach(k => {
      const o = entry.old_value?.[k];
      const n = entry.new_value?.[k];
      if (JSON.stringify(o) !== JSON.stringify(n)) changes.push({ key: k, old: o, new: n });
    });
    if (changes.length === 0) return null;
    return (
      <table className="text-xs w-full mt-2 border-collapse">
        <thead>
          <tr className="bg-[#f8fafc]">
            <th className="text-right px-3 py-1.5 border border-[#e2e8f0] text-[#64748b] font-medium w-1/3">שדה</th>
            <th className="text-right px-3 py-1.5 border border-[#e2e8f0] text-[#64748b] font-medium w-1/3">לפני</th>
            <th className="text-right px-3 py-1.5 border border-[#e2e8f0] text-[#64748b] font-medium w-1/3">אחרי</th>
          </tr>
        </thead>
        <tbody>
          {changes.map(c => (
            <tr key={c.key}>
              <td className="px-3 py-1.5 border border-[#e2e8f0] font-medium text-[#374151]">{c.key}</td>
              <td className="px-3 py-1.5 border border-[#e2e8f0] text-red-600 bg-red-50">
                {c.old === null || c.old === undefined ? "—" : String(c.old)}
              </td>
              <td className="px-3 py-1.5 border border-[#e2e8f0] text-green-700 bg-green-50">
                {c.new === null || c.new === undefined ? "—" : String(c.new)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div>
      <Header title="יומן פעולות" />
      <div className="p-6 space-y-4">

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Select value={filters.user_id} onValueChange={v => { setFilters(f => ({ ...f, user_id: v })); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="כל המשתמשים" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">כל המשתמשים</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.entity_type} onValueChange={v => { setFilters(f => ({ ...f, entity_type: v })); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="כל הסוגים" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">כל הסוגים</SelectItem>
                  {Object.entries(ENTITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={filters.from}
                onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(1); }}
                placeholder="מתאריך" />
              <Input type="date" value={filters.to}
                onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(1); }}
                placeholder="עד תאריך" />
            </div>
          </CardContent>
        </Card>

        {/* Count + Refresh */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#64748b]">
            {loading ? "טוען..." : `${total.toLocaleString()} רשומות`}
          </p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="h-3.5 w-3.5" /> רענן
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16 text-[#94a3b8]">
              <History className="h-14 w-14 mx-auto mb-3 opacity-20" />
              <p className="font-medium">אין רשומות ביומן</p>
              <p className="text-sm mt-1">פעולות במערכת יופיעו כאן</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {entries.map(entry => (
              <Card key={entry.id} className="overflow-hidden hover:shadow-sm transition-shadow">
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                >
                  {/* User avatar */}
                  <div className="w-9 h-9 rounded-full bg-[#f1f5f9] flex items-center justify-center text-sm font-bold text-[#64748b] shrink-0">
                    {entry.user?.full_name?.charAt(0) || "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-[#0f172a]">
                        {entry.user?.full_name || "מערכת"}
                      </span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        ACTION_COLORS[entry.action] || "bg-gray-100 text-gray-600"
                      )}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </span>
                      <span className="text-xs text-[#64748b]">
                        {ENTITY_LABELS[entry.entity_type] || entry.entity_type}
                      </span>
                      {entry.entity_id && (
                        <span className="text-xs text-[#94a3b8] font-mono">
                          #{entry.entity_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    {(entry.new_value?.title || entry.old_value?.title) && (
                      <p className="text-xs text-[#64748b] mt-0.5 truncate">
                        {entry.new_value?.title || entry.old_value?.title}
                      </p>
                    )}
                  </div>

                  <div className="text-left shrink-0">
                    <p className="text-xs text-[#94a3b8]">
                      {new Date(entry.created_at).toLocaleDateString("he-IL")}
                    </p>
                    <p className="text-xs text-[#94a3b8]">
                      {new Date(entry.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>

                {/* Expanded diff */}
                {expanded === entry.id && (entry.old_value || entry.new_value) && (
                  <div className="px-4 pb-4 border-t border-[#f1f5f9] pt-3">
                    {renderDiff(entry)}
                    {!entry.old_value && entry.new_value && (
                      <pre className="text-xs bg-[#f8fafc] p-3 rounded-lg overflow-auto max-h-40">
                        {JSON.stringify(entry.new_value, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline" size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-[#64748b]">
              עמוד {page} מתוך {totalPages}
            </span>
            <Button
              variant="outline" size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
