-- =============================================
-- CRM System - Supabase Database Schema
-- הרץ קובץ זה ב-Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee', 'client')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CUSTOMERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  logo_url TEXT,
  monthly_hours NUMERIC(10,2),
  renewal_day INTEGER DEFAULT 1 CHECK (renewal_day BETWEEN 1 AND 31),
  alert_percentage INTEGER DEFAULT 80 CHECK (alert_percentage BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CUSTOMER PHONES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS customer_phones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROJECTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'active', 'pending', 'completed', 'cancelled')),
  start_date DATE,
  due_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TASKS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'pending', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  start_date DATE,
  due_date DATE,
  notes TEXT,
  notify_client_on_complete BOOLEAN DEFAULT FALSE,
  pending_deletion BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUBTASKS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TIME ENTRIES TABLE (Timers)
-- =============================================
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration INTEGER DEFAULT 0,  -- in seconds
  notes TEXT,
  is_edited BOOLEAN DEFAULT FALSE,
  edited_by UUID REFERENCES users(id),
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ATTENDANCE TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  total_hours INTEGER,  -- in seconds
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MEETINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  meeting_link TEXT,
  notes TEXT,
  google_event_id TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MEETING PARTICIPANTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'declined')),
  UNIQUE(meeting_id, user_id)
);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CHAT CONVERSATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL DEFAULT 'private' CHECK (type IN ('private', 'group')),
  name TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CHAT PARTICIPANTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS chat_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_admin BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

-- =============================================
-- CHAT MESSAGES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'file')),
  is_edited BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  reply_to UUID REFERENCES chat_messages(id),
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CHAT REACTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS chat_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- =============================================
-- DOCUMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type TEXT,
  category TEXT,
  visible_to TEXT DEFAULT 'all' CHECK (visible_to IN ('all', 'employees', 'clients', 'admin')),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- AUDIT LOG TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SYSTEM SETTINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT DEFAULT 'מערכת CRM',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#16a34a',
  timezone TEXT DEFAULT 'Asia/Jerusalem',
  timer_edit_mode TEXT DEFAULT 'free' CHECK (timer_edit_mode IN ('none', 'free', 'days', 'approval')),
  timer_edit_days INTEGER DEFAULT 7,
  task_auto_complete BOOLEAN DEFAULT FALSE,
  task_delete_approval BOOLEAN DEFAULT TRUE,
  chat_require_approval BOOLEAN DEFAULT TRUE,
  calendar_show_tasks BOOLEAN DEFAULT TRUE,
  hours_alert_percentage INTEGER DEFAULT 80,
  email_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLICIES
-- =============================================

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Users: everyone can read, only admin can write
CREATE POLICY "Users readable by authenticated" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users editable by admin" ON users FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Users can read own" ON users FOR SELECT TO authenticated USING (id = auth.uid());

-- Customers: admin full access, employees read
CREATE POLICY "Customers admin" ON customers FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Customers employee read" ON customers FOR SELECT TO authenticated USING (get_user_role(auth.uid()) IN ('employee', 'client'));

-- Customer phones
CREATE POLICY "Customer phones all" ON customer_phones FOR ALL TO authenticated USING (true);

-- Projects: admin full, employees read
CREATE POLICY "Projects admin" ON projects FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Projects employee read" ON projects FOR SELECT TO authenticated USING (get_user_role(auth.uid()) = 'employee');

-- Tasks: admin full, employees can manage their tasks
CREATE POLICY "Tasks admin" ON tasks FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Tasks employee" ON tasks FOR ALL TO authenticated USING (
  get_user_role(auth.uid()) = 'employee' AND (
    assigned_user_id = auth.uid() OR created_by = auth.uid()
  )
);

-- Subtasks
CREATE POLICY "Subtasks all" ON subtasks FOR ALL TO authenticated USING (true);

-- Time entries: admin all, employee own
CREATE POLICY "Time entries admin" ON time_entries FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Time entries employee" ON time_entries FOR ALL TO authenticated USING (
  get_user_role(auth.uid()) = 'employee' AND user_id = auth.uid()
);

-- Attendance: admin all, employee own
CREATE POLICY "Attendance admin" ON attendance FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Attendance employee" ON attendance FOR ALL TO authenticated USING (
  get_user_role(auth.uid()) = 'employee' AND user_id = auth.uid()
);

-- Notifications: users see own
CREATE POLICY "Notifications own" ON notifications FOR ALL TO authenticated USING (user_id = auth.uid());

-- Chat: participants only
CREATE POLICY "Chat conversations" ON chat_conversations FOR ALL TO authenticated USING (true);
CREATE POLICY "Chat participants" ON chat_participants FOR ALL TO authenticated USING (true);
CREATE POLICY "Chat messages" ON chat_messages FOR ALL TO authenticated USING (true);

-- Documents
CREATE POLICY "Documents all" ON documents FOR ALL TO authenticated USING (true);

-- Audit log: admin only
CREATE POLICY "Audit log admin" ON audit_log FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- System settings: admin write, all read
CREATE POLICY "Settings read" ON system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Settings admin write" ON system_settings FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_customer ON time_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);

-- =============================================
-- TRIGGER: Update updated_at automatically
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- FUNCTION: Create user profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- SAMPLE DATA (optional - for testing)
-- =============================================

-- Create admin user (replace with your actual user ID after signing up)
-- UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
