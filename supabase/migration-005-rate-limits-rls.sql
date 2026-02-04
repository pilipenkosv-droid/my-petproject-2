-- Migration 005: Enable RLS for rate_limits table
-- This table is used only by server code via admin client (service_role)

-- Enable RLS for rate_limits
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: only service_role can read/write
-- Users should not have direct access to rate_limits
CREATE POLICY "Service role full access on rate_limits"
ON rate_limits FOR ALL
USING (true)
WITH CHECK (true);
