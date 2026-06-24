-- Migration 001: Allow null customer_id in time_entries
-- הרץ ב-Supabase SQL Editor אם כבר הרצת את schema.sql

ALTER TABLE time_entries
  DROP CONSTRAINT IF EXISTS time_entries_customer_id_fkey;

ALTER TABLE time_entries
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
