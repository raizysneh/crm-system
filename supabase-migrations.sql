-- ============================================================
-- CRM System - New Feature Migrations
-- Run these in the Supabase SQL Editor
-- ============================================================

-- 1. Recurring tasks columns (add to tasks table)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_recurring        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurrence_type     TEXT,        -- daily | weekly | monthly | yearly | custom
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_days     TEXT[],      -- ['sun','mon',...] for weekly
  ADD COLUMN IF NOT EXISTS recurrence_end_type TEXT,        -- never | date | count
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_end_count INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- 2. Chat message reply support
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

-- 3. Task file attachments table
CREATE TABLE IF NOT EXISTS task_attachments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    INTEGER,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for task_attachments
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_attachments_all" ON task_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Audit log table (if not exists)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,   -- create | update | delete | login | logout | ...
  entity_type TEXT NOT NULL,   -- task | project | customer | ...
  entity_id   UUID,
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- RLS for audit_logs — admin only
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin" ON audit_logs FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- 5. Supabase Storage bucket for attachments
-- Run this in the Supabase dashboard > Storage > New bucket: "attachments" (public)
-- Or via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy
CREATE POLICY "attachments_all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'attachments');

-- 6. Meetings table (if not exists)
CREATE TABLE IF NOT EXISTS meetings (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  location     TEXT,
  meeting_link TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id  UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(meeting_id, user_id)
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meetings_all" ON meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meeting_participants_all" ON meeting_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Notifications table (if not exists)
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'task',
  title      TEXT NOT NULL,
  body       TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  link       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON notifications FOR ALL TO authenticated USING (user_id = auth.uid());

-- 8. Chat reactions table (persistent emoji reactions)
CREATE TABLE IF NOT EXISTS chat_reactions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id     UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji          TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_reactions_all" ON chat_reactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Task attachments storage policy (already covered above, here for reference)
-- Storage bucket "attachments" must be created as PUBLIC in Supabase dashboard

-- Enable realtime for notifications + reactions
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;
