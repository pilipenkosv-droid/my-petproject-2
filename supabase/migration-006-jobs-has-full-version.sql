-- Migration 006: Add has_full_version column to jobs table
-- This flag indicates that a trial user's job has full versions saved
-- which can be unlocked after payment

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS has_full_version BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN jobs.has_full_version IS 'Indicates full version files are saved (for trial users, unlocked after payment)';
