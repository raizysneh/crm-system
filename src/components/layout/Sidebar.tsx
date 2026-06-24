"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FolderOpen, CheckSquare, Timer,
  Clock, BarChart3, Settings, MessageSquare, Calendar,
  FileText, LogOut, Building2, Menu, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const adminNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "דשבורד" },
  { href: "/clients", icon: Users, label: "לקוחות" },
  { href: "/projects", icon: FolderOpen, label: "פרויקטים" },
  { href: "/tasks", icon: CheckSquare, label: "משימות" },
  { href: "/timers", icon: Timer, label: "טיימרים" },
  { href: "/attendance", icon: Clock, label: "נוכחות" },
  { href: "/reports", icon: BarChart3, label: "דוחות" },
  { href: "/chat", icon: MessageSquare, label: "צ'אט" },
  { href: "/calendar", icon: Calendar, label: "לוח שנה" },
  { href: "/documents", icon: FileText, label: "נהלים" },
  { href: "/settings", icon: Settings, label: "הגדרות" },
];

const employeeNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "דשבורד" },
  { href: "/tasks", icon: CheckSquare, label: "המשימות שלי" },
  { href: "/timers", icon: Timer, label: "טיימרים" },
  { href: "/attendance", icon: Clock, label: "נוכחות" },
  { href: "/chat", icon: MessageSquare, label: "צ'אט" },
  { href: "/calendar", icon: Calendar, label: "לוח שנה" },
  { href: "/documents", icon: FileText, label: "נהלים" },
];

const clientNav = [
  { href: "/portal", icon: LayoutDashboard, label: "הפרויקטים שלי" },
  { href: "/portal/tasks", icon: CheckSquare, label: "המשימות שלי" },
  { href: "/chat", icon: MessageSquare, label: "צ'אט" },
  { href: "/portal/documents", icon: FileText, label: "מסמכים" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = user?.role === "admin"
    ? adminNav
    : user?.role === "employee"
    ? employeeNav
    : clientNav;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 h-full bg-[#0f172a] flex flex-col z-40 transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[#1e293b]">
        <div className="w-9 h-9 bg-[#16a34a] rounded-lg flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-semibold text-sm truncate">מערכת CRM</p>
            <p className="text-[#64748b] text-xs truncate">ניהול עסקי</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mr-auto text-[#64748b] hover:text-white"
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#16a34a] text-white"
                      : "text-[#94a3b8] hover:text-white hover:bg-[#1e293b]"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User + Logout */}
      <div className="border-t border-[#1e293b] p-3">
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 bg-[#16a34a] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.full_name?.charAt(0) || "?"}
            </div>
            <div className="overflow-hidden">
              <p className="text-white text-xs font-medium truncate">{user.full_name}</p>
              <p className="text-[#64748b] text-xs truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          title="התנתק"
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[#94a3b8] hover:text-red-400 hover:bg-[#1e293b] transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>התנתק</span>}
        </button>
      </div>
    </aside>
  );
}
