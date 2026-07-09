"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import FloatingTimer from "@/components/layout/FloatingTimer";
import { useAuthStore } from "@/store/authStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#64748b] text-sm">טוען...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Sidebar />
      <FloatingTimer />
      <main className="mr-[220px] min-h-screen transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
