-- Add date_fixed column to existing van-issues table
ALTER TABLE "van-issues" 
ADD COLUMN IF NOT EXISTS date_fixed TIMESTAMP WITH TIME ZONE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS "idx_van-issues_date_fixed" ON "van-issues"(date_fixed); 