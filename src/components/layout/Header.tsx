"use client";

import { Bell, Search, CheckCheck, X, Clock, CheckSquare, Users, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
  link?: string | null;
}

const NOTIF_ICONS: Record<string, any> = {
  task: CheckSquare,
  timer: Clock,
  client: Users,
  alert: AlertTriangle,
};

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  const { user } = useAuthStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) loadNotifications();
  }, [user]);

  // Close on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => loadNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const list = (data || []) as Notification[];
    setNotifications(list);
    setUnreadCount(list.filter(n => !n.is_read).length);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const deleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => {
      const wasUnread = notifications.find(n => n.id === id)?.is_read === false;
      return wasUnread ? Math.max(0, prev - 1) : prev;
    });
  };

  return (
    <header className="h-16 bg-white border-b border-[#e2e8f0] flex items-center gap-4 px-6 sticky top-0 z-30">
      {/* Title */}
      <div className="flex-1">
        {title && <h1 className="text-lg font-semibold text-[#0f172a]">{title}</h1>}
      </div>

      {/* Search */}
      <div className="relative hidden md:flex items-center">
        <Search className="absolute right-3 h-4 w-4 text-[#94a3b8]" />
        <input
          type="search"
          placeholder="חיפוש..."
          className="pr-9 pl-4 h-9 w-56 rounded-lg border border-[#e2e8f0] text-sm bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:bg-white"
        />
      </div>

      {/* Notifications */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setNotifOpen(o => !o)}
          className="relative p-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b] hover:text-[#0f172a] transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-0.5">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {notifOpen && (
          <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-[#e2e8f0] overflow-hidden z-50" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
              <h3 className="font-semibold text-[#0f172a]">
                התראות
                {unreadCount > 0 && (
                  <span className="mr-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                    {unreadCount} חדש
                  </span>
                )}
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-[#16a34a] hover:text-[#15803d] font-medium"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  סמן הכל כנקרא
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-[#94a3b8]">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">אין התראות</p>
                </div>
              ) : (
                notifications.map(n => {
                  const Icon = NOTIF_ICONS[n.type] || Bell;
                  return (
                    <div
                      key={n.id}
                      onClick={() => !n.is_read && markOneRead(n.id)}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 border-b border-[#f8fafc] cursor-pointer hover:bg-[#f8fafc] transition-colors group",
                        !n.is_read && "bg-[#f0fdf4]"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        !n.is_read ? "bg-[#dcfce7] text-[#16a34a]" : "bg-[#f1f5f9] text-[#94a3b8]"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm leading-tight",
                          !n.is_read ? "font-semibold text-[#0f172a]" : "font-medium text-[#374151]"
                        )}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-xs text-[#64748b] mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                        <p className="text-[10px] text-[#94a3b8] mt-1">{formatDateTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full bg-[#16a34a] mt-2 shrink-0" />
                      )}
                      <button
                        onClick={(e) => deleteNotif(n.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#e2e8f0] text-[#94a3b8] transition-all shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[#f1f5f9] text-center">
                <button
                  onClick={async () => {
                    await supabase.from("notifications").delete().eq("user_id", user?.id!);
                    setNotifications([]);
                    setUnreadCount(0);
                  }}
                  className="text-xs text-[#94a3b8] hover:text-red-500 transition-colors"
                >
                  נקה הכל
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#16a34a] rounded-full flex items-center justify-center text-white text-xs font-bold">
          {user?.full_name?.charAt(0) || "?"}
        </div>
        <div className="hidden md:block">
          <p className="text-sm font-medium text-[#0f172a] leading-tight">{user?.full_name}</p>
          <p className="text-xs text-[#64748b]">
            {user?.role === "admin" ? "מנהל מערכת" : user?.role === "employee" ? "עובד" : "לקוח"}
          </p>
        </div>
      </div>
    </header>
  );
}
