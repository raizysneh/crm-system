"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, X, Building2, CheckSquare, Timer, TrendingUp, Calendar, Users, MessageSquare } from "lucide-react";

const ACTIONS = [
  { href: "/clients",    label: "לקוחות",  icon: Building2,    gradient: "from-blue-500 to-blue-600" },
  { href: "/tasks",      label: "משימות",   icon: CheckSquare,  gradient: "from-violet-500 to-purple-600" },
  { href: "/timers",     label: "טיימרים",  icon: Timer,        gradient: "from-emerald-500 to-green-600" },
  { href: "/reports",    label: "דוחות",    icon: TrendingUp,   gradient: "from-amber-500 to-orange-500" },
  { href: "/calendar",   label: "יומן",     icon: Calendar,     gradient: "from-sky-500 to-cyan-600" },
  { href: "/chat",       label: "צ׳אט",     icon: MessageSquare, gradient: "from-pink-500 to-rose-500" },
];

export default function QuickActionsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        title="פעולות מהירות"
        className="fixed bottom-6 left-6 z-40 w-12 h-12 rounded-full bg-[#16a34a] text-white shadow-lg hover:bg-[#15803d] hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
      >
        <Zap className="h-5 w-5 fill-white" />
      </button>

      {/* Overlay + modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#f0fdf4] flex items-center justify-center">
                  <Zap className="h-4 w-4 text-[#16a34a] fill-[#16a34a]" />
                </div>
                <h2 className="font-bold text-[#0f172a]">פעולות מהירות</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#f1f5f9] text-[#94a3b8] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-2.5">
                {ACTIONS.map(a => (
                  <Link key={a.href} href={a.href} onClick={() => setOpen(false)}>
                    <div className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br ${a.gradient} rounded-xl py-4 hover:opacity-90 hover:scale-105 active:scale-95 transition-all cursor-pointer`}>
                      <a.icon className="h-5 w-5 text-white" />
                      <span className="text-[11px] font-bold text-white tracking-wide">{a.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
