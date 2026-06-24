export type UserRole = "admin" | "employee" | "client";
export type UserStatus = "active" | "inactive";

export type ClientStatus = "active" | "inactive";

export type ProjectStatus = "new" | "active" | "pending" | "completed" | "cancelled";

export type TaskStatus = "new" | "in_progress" | "pending" | "completed" | "cancelled";
export type TaskPriority = "high" | "medium" | "low";

export type TimerStatus = "running" | "paused" | "stopped";

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  company_name: string;
  contact_name?: string;
  email?: string;
  notes?: string;
  status: ClientStatus;
  logo_url?: string;
  monthly_hours?: number;
  renewal_day?: number;
  alert_percentage?: number;
  created_at: string;
  updated_at?: string;
  phones?: CustomerPhone[];
  hours_used?: number;
  hours_remaining?: number;
  usage_percentage?: number;
}

export interface CustomerPhone {
  id: string;
  customer_id: string;
  phone: string;
  label?: string;
}

export interface Project {
  id: string;
  customer_id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  start_date?: string;
  due_date?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  customer?: Customer;
  tasks_count?: number;
  open_tasks?: number;
  completed_tasks?: number;
  progress?: number;
  hours_spent?: number;
}

export interface Task {
  id: string;
  customer_id: string;
  project_id?: string;
  assigned_user_id?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_date?: string;
  due_date?: string;
  notes?: string;
  notify_client_on_complete?: boolean;
  is_recurring?: boolean;
  recurrence_type?: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  recurrence_interval?: number;
  recurrence_days?: string[];
  recurrence_end_type?: "never" | "date" | "count";
  recurrence_end_date?: string;
  recurrence_end_count?: number;
  recurrence_parent_id?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  customer?: Customer;
  project?: Project;
  assigned_user?: User;
  subtasks?: Subtask[];
  subtasks_count?: number;
  completed_subtasks?: number;
  progress?: number;
  pending_deletion?: boolean;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  completed_at?: string;
  completed_by?: string;
  sort_order?: number;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  customer_id: string;
  project_id?: string;
  task_id?: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  notes?: string;
  created_at: string;
  user?: User;
  customer?: Customer;
  project?: Project;
  task?: Task;
}

export interface Attendance {
  id: string;
  user_id: string;
  check_in: string;
  check_out?: string;
  total_hours?: number;
  created_at: string;
  user?: User;
}

export interface Meeting {
  id: string;
  customer_id?: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  location?: string;
  meeting_link?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  customer?: Customer;
  participants?: User[];
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message?: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  type: "private" | "group";
  name?: string;
  created_by: string;
  created_at: string;
  participants?: User[];
  last_message?: ChatMessage;
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: "text" | "voice" | "file";
  is_edited: boolean;
  is_pinned: boolean;
  reply_to?: string;
  created_at: string;
  updated_at?: string;
  sender?: User;
  reactions?: ChatReaction[];
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  user?: User;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  created_at: string;
  user?: User;
}

export interface SystemSettings {
  id: string;
  business_name: string;
  logo_url?: string;
  primary_color?: string;
  timezone?: string;
  timer_edit_mode?: "none" | "free" | "days" | "approval";
  timer_edit_days?: number;
  task_auto_complete?: boolean;
  task_delete_approval?: boolean;
  chat_require_approval?: boolean;
  calendar_show_tasks?: boolean;
  hours_alert_percentage?: number;
  email_signature?: string;
}

export interface DashboardStats {
  active_employees: number;
  active_timers: number;
  today_hours: number;
  week_hours: number;
  month_hours: number;
  open_tasks: number;
  overdue_tasks: number;
  completed_today: number;
  clients_over_limit: number;
  clients_near_limit: number;
}
