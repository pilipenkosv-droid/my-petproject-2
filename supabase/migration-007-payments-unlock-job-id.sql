-- Migration 007: Add unlock_job_id column to payments table
-- This stores the jobId that should be unlocked (full version) after successful payment

ALTER TABLE payments ADD COLUMN IF NOT EXISTS unlock_job_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN payments.unlock_job_id IS 'Job ID to unlock full version after successful payment (hook-offer feature)';
