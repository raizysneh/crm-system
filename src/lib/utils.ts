import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDuration, intervalToDuration } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = "dd/MM/yyyy") {
  return format(new Date(date), fmt);
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), "dd/MM/yyyy HH:mm");
}

export function formatTime(date: string | Date) {
  return format(new Date(date), "HH:mm");
}

export function formatDurationSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h === 0 && m === 0) return `${s} שנ'`;
  if (h === 0) return `${m}:${String(s).padStart(2, "0")} דק'`;
  return `${h}:${String(m).padStart(2, "0")} שע'`;
}

export function secondsToHoursDecimal(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

export function hoursToSeconds(hours: number): number {
  return hours * 3600;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    new: "bg-blue-100 text-blue-800",
    in_progress: "bg-blue-100 text-blue-800",
    pending: "bg-yellow-100 text-yellow-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-800",
    inactive: "bg-gray-100 text-gray-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "פעיל",
    new: "חדש",
    in_progress: "בטיפול",
    pending: "ממתין",
    completed: "הושלם",
    cancelled: "בוטל",
    inactive: "לא פעיל",
    high: "גבוהה",
    medium: "בינונית",
    low: "נמוכה",
    admin: "מנהל מערכת",
    employee: "עובד",
    client: "לקוח",
  };
  return labels[status] || status;
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    high: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
  };
  return colors[priority] || "bg-gray-100 text-gray-800";
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date();
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.substring(0, n - 1) + "..." : str;
}
