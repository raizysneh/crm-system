-- Migration 002: create chat_message_reads (referenced by the app, never actually created)
-- הרץ ב-Supabase SQL Editor

CREATE TABLE IF NOT EXISTS chat_message_reads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reads_message ON chat_message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user ON chat_message_reads(user_id);

ALTER TABLE chat_message_reads ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see who read what (matches the other chat tables'
-- openness), but a user can only ever mark things read for themselves —
-- not strictly required since the app only ever writes this via the
-- service-role API route, but keeps the table safe if that ever changes.
CREATE POLICY "Chat message reads readable" ON chat_message_reads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Chat message reads own writes" ON chat_message_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
