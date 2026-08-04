import { create } from "zustand";
import { persist } from "zustand/middleware";

// Remembers the tasks page's filters/view across navigation — the page
// component unmounts on route change, so local state alone resets every time.
interface TasksFilterStore {
  viewMode: "list" | "kanban";
  filterStatus: string;
  filterPriority: string;
  filterClient: string;
  filterEmployee: string; // "me" | "all" | a specific user id
  showArchive: boolean;
  showFuture: boolean;
  setViewMode: (v: "list" | "kanban") => void;
  setFilterStatus: (v: string) => void;
  setFilterPriority: (v: string) => void;
  setFilterClient: (v: string) => void;
  setFilterEmployee: (v: string) => void;
  setShowArchive: (v: boolean) => void;
  setShowFuture: (v: boolean) => void;
}

export const useTasksFilterStore = create<TasksFilterStore>()(
  persist(
    (set) => ({
      viewMode: "list",
      filterStatus: "all",
      filterPriority: "all",
      filterClient: "all",
      filterEmployee: "me",
      showArchive: false,
      showFuture: false,
      setViewMode:       (v) => set({ viewMode: v }),
      setFilterStatus:   (v) => set({ filterStatus: v }),
      setFilterPriority: (v) => set({ filterPriority: v }),
      setFilterClient:   (v) => set({ filterClient: v }),
      setFilterEmployee: (v) => set({ filterEmployee: v }),
      setShowArchive:    (v) => set({ showArchive: v }),
      setShowFuture:     (v) => set({ showFuture: v }),
    }),
    { name: "crm-tasks-filters" }
  )
);
