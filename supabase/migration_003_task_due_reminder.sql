-- Tracks whether the "task is due today" email reminder has already been sent,
-- so the daily cron doesn't re-send it every day the task stays open.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_reminder_sent_at TIMESTAMPTZ;
