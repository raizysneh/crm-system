"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FolderOpen, CheckSquare, Timer,
  Clock, BarChart3, Settings, MessageSquare, Calendar,
  FileText, LogOut, Building2, ChevronRight, History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; icon: any; label: string };
type NavGroup = { label: string; items: NavItem[] };

const adminGroups: NavGroup[] = [
  {
    label: "ראשי",
    items: [
      { href: "/dashboard",  icon: LayoutDashboard, label: "דשבורד" },
      { href: "/clients",    icon: Users,           label: "לקוחות" },
      { href: "/projects",   icon: FolderOpen,      label: "פרויקטים" },
      { href: "/tasks",      icon: CheckSquare,     label: "משימות" },
    ],
  },
  {
    label: "עבודה",
    items: [
      { href: "/timers",     icon: Timer,           label: "טיימרים" },
      { href: "/attendance", icon: Clock,           label: "נוכחות" },
      { href: "/reports",    icon: BarChart3,       label: "דוחות" },
    ],
  },
  {
    label: "תקשורת",
    items: [
      { href: "/chat",       icon: MessageSquare,   label: "צ'אט" },
      { href: "/calendar",   icon: Calendar,        label: "לוח שנה" },
      { href: "/documents",  icon: FileText,        label: "נהלים" },
    ],
  },
  {
    label: "מערכת",
    items: [
      { href: "/audit",      icon: History,         label: "יומן פעולות" },
      { href: "/settings",   icon: Settings,        label: "הגדרות" },
    ],
  },
];

const employeeGroups: NavGroup[] = [
  {
    label: "ראשי",
    items: [
      { href: "/dashboard",  icon: LayoutDashboard, label: "דשבורד" },
      { href: "/tasks",      icon: CheckSquare,     label: "המשימות שלי" },
      { href: "/timers",     icon: Timer,           label: "טיימרים" },
      { href: "/attendance", icon: Clock,           label: "נוכחות" },
      { href: "/reports",    icon: BarChart3,       label: "הדוחות שלי" },
    ],
  },
  {
    label: "תקשורת",
    items: [
      { href: "/chat",       icon: MessageSquare,   label: "צ'אט" },
      { href: "/calendar",   icon: Calendar,        label: "לוח שנה" },
      { href: "/documents",  icon: FileText,        label: "נהלים" },
    ],
  },
];

const clientGroups: NavGroup[] = [
  {
    label: "הפורטל שלי",
    items: [
      { href: "/portal",           icon: LayoutDashboard, label: "הפרויקטים שלי" },
      { href: "/portal/tasks",     icon: CheckSquare,     label: "המשימות שלי" },
      { href: "/chat",             icon: MessageSquare,   label: "צ'אט" },
      { href: "/portal/documents", icon: FileText,        label: "מסמכים" },
    ],
  },
];

export default function Sidebar() {
  const pathname  = usePathname();
  const { user }  = useAuthStore();
  const router    = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const groups = user?.role === "admin"
    ? adminGroups
    : user?.role === "employee"
    ? employeeGroups
    : clientGroups;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const roleLabel =
    user?.role === "admin"    ? "מנהל מערכת" :
    user?.role === "employee" ? "עובד"        : "לקוח";

  return (
    <aside className={cn(
      "fixed top-0 right-0 h-full flex flex-col z-40 transition-all duration-300 select-none",
      "bg-gradient-to-b from-[#0d1629] to-[#0f172a]",
      collapsed ? "w-[60px]" : "w-[220px]"
    )}>

      {/* ── Logo ── */}
      <div className={cn(
        "flex items-center gap-2.5 border-b border-white/5",
        collapsed ? "px-3 py-4 justify-center" : "px-4 py-4"
      )}>
        <div className="w-8 h-8 bg-[#16a34a] rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-green-900/40">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden flex-1">
            <p className="text-white font-bold text-sm leading-tight">מערכת CRM</p>
            <p className="text-[#475569] text-[10px] mt-0.5">ניהול עסקי</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "text-[#475569] hover:text-white rounded-md p-1 hover:bg-white/5",
            collapsed && "mt-0"
          )}
          title={collapsed ? "הרחב תפריט" : "כווץ תפריט"}
        >
          <ChevronRight className={cn("h-4 w-4 transition-transform duration-300", !collapsed && "rotate-180")} />
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[#334155] text-[9px] font-bold uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg text-[13px] font-medium relative group/nav",
                        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                        isActive
                          ? "bg-[#16a34a]/15 text-[#4ade80]"
                          : "text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/5"
                      )}
                    >
                      {isActive && (
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#16a34a] rounded-full" />
                      )}
                      <item.icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
                      {!collapsed && <span>{item.label}</span>}

                      {/* Tooltip when collapsed */}
                      {collapsed && (
                        <div className="absolute right-full mr-2 px-2 py-1 bg-[#1e293b] text-white text-xs rounded-md whitespace-nowrap
                          opacity-0 group-hover/nav:opacity-100 pointer-events-none transition-opacity shadow-xl border border-white/10 z-50">
                          {item.label}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── User & Logout ── */}
      <div className="border-t border-white/5 p-2.5 space-y-1">
        {!collapsed && user && (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/5 mb-1">
            <div className="w-7 h-7 bg-[#16a34a] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.full_name?.charAt(0) || "?"}
            </div>
            <div className="overflow-hidden flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate leading-tight">{user.full_name}</p>
              <p className="text-[#475569] text-[10px] truncate">{roleLabel}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          title="התנתק"
          className={cn(
            "flex items-center gap-2.5 w-full rounded-lg text-[13px] text-[#64748b] hover:text-red-400 hover:bg-red-950/30",
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
          )}
        >
          <LogOut className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
          {!collapsed && <span>התנתק</span>}
        </button>
      </div>
    </aside>
  );
}
