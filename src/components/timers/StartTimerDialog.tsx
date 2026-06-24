"use client";

import { useState, useEffect } from "react";
import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { Customer, Task } from "@/types";
import { useTimerStore } from "@/store/timerStore";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
  onStart: () => void;
}

export default function StartTimerDialog({ onClose, onStart }: Props) {
  const { startTimer } = useTimerStore();
  const [clients, setClients] = useState<Customer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedTask, setSelectedTask] = useState("");

  useEffect(() => {
    supabase.from("customers").select("id, company_name").eq("status", "active").order("company_name")
      .then(({ data }) => setClients(data || []));
  }, []);

  useEffect(() => {
    if (!selectedClient) { setTasks([]); return; }
    supabase.from("tasks")
      .select("id, title, project_id")
      .eq("customer_id", selectedClient)
      .neq("status", "completed")
      .order("title")
      .then(({ data }) => setTasks(data || []));
  }, [selectedClient]);

  const handleStart = () => {
    if (!selectedClient) { toast.error("בחר לקוח"); return; }
    const client = clients.find(c => c.id === selectedClient);
    const task = tasks.find(t => t.id === selectedTask);
    if (!client) return;

    startTimer({
      customer_id: client.id,
      customer_name: client.company_name,
      task_id: task?.id,
      task_title: task?.title,
      project_id: task?.project_id,
    });

    toast.success("טיימר הופעל");
    onStart();
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>הפעלת טיימר</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 space-y-4">
          <div className="space-y-1.5">
            <Label>לקוח *</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tasks.length > 0 && (
            <div className="space-y-1.5">
              <Label>משימה (אופציונלי)</Label>
              <Select value={selectedTask} onValueChange={setSelectedTask}>
                <SelectTrigger><SelectValue placeholder="בחר משימה" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">ללא משימה</SelectItem>
                  {tasks.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleStart}>
            <Play className="h-4 w-4" /> הפעל
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
