-- Staff Rosters Table Schema
-- This table stores staff roster images that can be uploaded by admins and viewed by drivers

CREATE TABLE IF NOT EXISTS staff_rosters (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Disable Row Level Security for public access (no authentication required)
ALTER TABLE staff_rosters DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Anyone can view staff rosters" ON staff_rosters;
DROP POLICY IF EXISTS "Anyone can insert staff rosters" ON staff_rosters;
DROP POLICY IF EXISTS "Anyone can update staff rosters" ON staff_rosters;
DROP POLICY IF EXISTS "Anyone can delete staff rosters" ON staff_rosters;

-- Create storage bucket for staff roster files if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-roster', 'staff-roster', true)
ON CONFLICT (id) DO NOTHING;

-- Drop any existing storage policies for staff-roster bucket
DROP POLICY IF EXISTS "Anyone can view staff roster files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload staff roster files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update staff roster files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete staff roster files" ON storage.objects;

-- Create open storage policies for staff-roster bucket (no authentication required)
CREATE POLICY "Open access for staff-roster bucket"
ON storage.objects FOR ALL
USING (bucket_id = 'staff-roster'); 