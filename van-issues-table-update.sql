-- Update existing van-issues table to remove authentication requirements
-- Run this instead of creating a new table

-- First, disable RLS on the existing table
ALTER TABLE "van-issues" DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Drivers can manage their own van issues" ON "van-issues";
DROP POLICY IF EXISTS "Admin can view all van issues" ON "van-issues";
DROP POLICY IF EXISTS "Allow van issue submissions" ON "van-issues";
DROP POLICY IF EXISTS "Service role can read all van issues" ON "van-issues";

-- Add verification columns to the existing table
ALTER TABLE "van-issues" 
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS verified_by TEXT,
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Grant full permissions to everyone (no authentication required)
GRANT ALL ON "van-issues" TO anon;
GRANT ALL ON "van-issues" TO authenticated;
GRANT ALL ON "van-issues" TO service_role;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "idx_van-issues_driver_id" ON "van-issues"(driver_id);
CREATE INDEX IF NOT EXISTS "idx_van-issues_created_at" ON "van-issues"(created_at);
CREATE INDEX IF NOT EXISTS "idx_van-issues_verified" ON "van-issues"(verified);
CREATE INDEX IF NOT EXISTS "idx_van-issues_verified_at" ON "van-issues"(verified_at);

-- Drop existing view if it exists and recreate it
DROP VIEW IF EXISTS van_issues_with_driver;

-- Create a view for easier querying with driver information
-- Using actual columns from drivers table: id, custom_id, name, role, phone_number, location
CREATE VIEW van_issues_with_driver AS
SELECT 
    vi.*,
    d.name as driver_name,
    d.custom_id as driver_custom_id,
    d.role as driver_role,
    d.phone_number as driver_phone,
    d.location as driver_location
FROM "van-issues" vi
JOIN drivers d ON vi.driver_id = d.id;

-- Grant full permissions on the view
GRANT ALL ON van_issues_with_driver TO anon;
GRANT ALL ON van_issues_with_driver TO authenticated;
GRANT ALL ON van_issues_with_driver TO service_role;

-- Also fix storage bucket permissions
-- Make sure the van-issues bucket exists and is public
INSERT INTO storage.buckets (id, name, public) 
VALUES ('van-issues', 'van-issues', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Remove any existing storage policies
DROP POLICY IF EXISTS "van-issues-policy" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can manage their own van issues" ON storage.objects;
DROP POLICY IF EXISTS "Admin can view all van issues" ON storage.objects;

-- Create open policy for van-issues bucket (no authentication required)
CREATE POLICY "Open access for van-issues" ON storage.objects
FOR ALL USING (bucket_id = 'van-issues'); 