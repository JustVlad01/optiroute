-- Add verification columns to existing van-issues table
ALTER TABLE "van-issues" 
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS verified_by TEXT,
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_van-issues_verified" ON "van-issues"(verified);
CREATE INDEX IF NOT EXISTS "idx_van-issues_verified_at" ON "van-issues"(verified_at); 