import { create } from "zustand";
import { persist } from "zustand/middleware";

// Remembers the reports page's filters/view across navigation — without this,
// leaving and coming back to /reports resets everything since the page
// component unmounts and its local state is lost.
interface ReportsFilterStore {
  filterClient: string;
  filterEmployee: string;
  dateFrom: string;
  dateTo: string;
  quickFilter: string;
  reportType: string;
  includeEmployee: boolean;
  breakdownBy: "customer" | "employee";
  setFilterClient: (v: string) => void;
  setFilterEmployee: (v: string) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setQuickFilter: (v: string) => void;
  setReportType: (v: string) => void;
  setIncludeEmployee: (v: boolean) => void;
  setBreakdownBy: (v: "customer" | "employee") => void;
}

const today = new Date().toISOString().split("T")[0];

export const useReportsFilterStore = create<ReportsFilterStore>()(
  persist(
    (set) => ({
      filterClient: "all",
      filterEmployee: "all",
      dateFrom: today,
      dateTo: today,
      quickFilter: "today",
      reportType: "detailed",
      includeEmployee: true,
      breakdownBy: "customer",
      setFilterClient:   (v) => set({ filterClient: v }),
      setFilterEmployee: (v) => set({ filterEmployee: v }),
      setDateFrom:       (v) => set({ dateFrom: v }),
      setDateTo:         (v) => set({ dateTo: v }),
      setQuickFilter:    (v) => set({ quickFilter: v }),
      setReportType:     (v) => set({ reportType: v }),
      setIncludeEmployee:(v) => set({ includeEmployee: v }),
      setBreakdownBy:    (v) => set({ breakdownBy: v }),
    }),
    { name: "crm-reports-filters" }
  )
);
