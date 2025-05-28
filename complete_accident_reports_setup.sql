-- Complete setup for accident reports without authentication
-- This script will create missing tables and set up proper public access

-- First, create the accident_report_images table if it doesn't exist
CREATE TABLE IF NOT EXISTS accident_report_images (
    id SERIAL PRIMARY KEY,
    accident_report_id INTEGER NOT NULL REFERENCES accident_reports(id) ON DELETE CASCADE,
    
    -- Storage bucket information
    storage_bucket_path VARCHAR(500) NOT NULL, -- Full path in your storage bucket
    storage_bucket_url VARCHAR(500), -- Public URL if available
    
    -- Image metadata
    original_filename VARCHAR(255) NOT NULL,
    file_size_bytes INTEGER,
    mime_type VARCHAR(100),
    image_order INTEGER DEFAULT 1, -- Order of images (1-5 as per form limit)
    
    -- Upload information
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    upload_status VARCHAR(20) DEFAULT 'pending', -- pending, uploaded, failed
    upload_error TEXT,
    
    -- Image processing (optional)
    thumbnail_path VARCHAR(500), -- If you generate thumbnails
    is_processed BOOLEAN DEFAULT FALSE,
    
    CONSTRAINT unique_report_image_order UNIQUE(accident_report_id, image_order)
);

-- Update existing accident_reports table to remove authentication requirements
-- First, check if the submitted_by_user_id column exists and remove it
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accident_reports' 
        AND column_name = 'submitted_by_user_id'
    ) THEN
        ALTER TABLE accident_reports DROP COLUMN submitted_by_user_id;
        RAISE NOTICE 'Removed submitted_by_user_id column from accident_reports table';
    ELSE
        RAISE NOTICE 'submitted_by_user_id column does not exist, skipping';
    END IF;
END $$;

-- Add any missing columns that might be needed
DO $$ 
BEGIN
    -- Add session_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accident_reports' 
        AND column_name = 'session_id'
    ) THEN
        ALTER TABLE accident_reports ADD COLUMN session_id VARCHAR(255);
        RAISE NOTICE 'Added session_id column to accident_reports table';
    END IF;

    -- Add form_version if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accident_reports' 
        AND column_name = 'form_version'
    ) THEN
        ALTER TABLE accident_reports ADD COLUMN form_version VARCHAR(10) DEFAULT '1.0';
        RAISE NOTICE 'Added form_version column to accident_reports table';
    END IF;

    -- Add ip_address if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accident_reports' 
        AND column_name = 'ip_address'
    ) THEN
        ALTER TABLE accident_reports ADD COLUMN ip_address INET;
        RAISE NOTICE 'Added ip_address column to accident_reports table';
    END IF;

    -- Add user_agent if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accident_reports' 
        AND column_name = 'user_agent'
    ) THEN
        ALTER TABLE accident_reports ADD COLUMN user_agent TEXT;
        RAISE NOTICE 'Added user_agent column to accident_reports table';
    END IF;
END $$;

-- DISABLE Row Level Security to allow public access without any restrictions
ALTER TABLE accident_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE accident_report_images DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies (they're not needed without RLS)
DROP POLICY IF EXISTS "Allow public insert on accident_reports" ON accident_reports;
DROP POLICY IF EXISTS "Allow public select on accident_reports" ON accident_reports;
DROP POLICY IF EXISTS "Allow public insert on accident_report_images" ON accident_report_images;
DROP POLICY IF EXISTS "Allow public select on accident_report_images" ON accident_report_images;

-- Grant full access to anonymous users (no authentication required)
GRANT ALL ON accident_reports TO anon;
GRANT ALL ON accident_report_images TO anon;
GRANT USAGE, SELECT ON SEQUENCE accident_reports_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE accident_report_images_id_seq TO anon;

-- Create missing indexes if they don't exist
DO $$ 
BEGIN
    -- Check and create indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accident_reports_date') THEN
        CREATE INDEX idx_accident_reports_date ON accident_reports(date_of_collision);
        RAISE NOTICE 'Created index idx_accident_reports_date';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accident_reports_created_at') THEN
        CREATE INDEX idx_accident_reports_created_at ON accident_reports(created_at);
        RAISE NOTICE 'Created index idx_accident_reports_created_at';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accident_reports_location') THEN
        CREATE INDEX idx_accident_reports_location ON accident_reports USING GIN(location_of_collision);
        RAISE NOTICE 'Created index idx_accident_reports_location';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accident_reports_my_registration') THEN
        CREATE INDEX idx_accident_reports_my_registration ON accident_reports(my_vehicle_registration);
        RAISE NOTICE 'Created index idx_accident_reports_my_registration';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accident_reports_other_registration') THEN
        CREATE INDEX idx_accident_reports_other_registration ON accident_reports(other_vehicle_registration);
        RAISE NOTICE 'Created index idx_accident_reports_other_registration';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accident_report_images_report_id') THEN
        CREATE INDEX idx_accident_report_images_report_id ON accident_report_images(accident_report_id);
        RAISE NOTICE 'Created index idx_accident_report_images_report_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accident_report_images_upload_status') THEN
        CREATE INDEX idx_accident_report_images_upload_status ON accident_report_images(upload_status);
        RAISE NOTICE 'Created index idx_accident_report_images_upload_status';
    END IF;
END $$;

-- Create or replace the update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_accident_reports_updated_at ON accident_reports;
CREATE TRIGGER update_accident_reports_updated_at 
    BEFORE UPDATE ON accident_reports 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Update table comments
COMMENT ON TABLE accident_reports IS 'Stores vehicle accident report information from RTC Bump Card forms';
COMMENT ON TABLE accident_report_images IS 'Stores image references and metadata for accident reports';
COMMENT ON COLUMN accident_reports.location_of_collision IS 'JSON object containing latitude, longitude, and address information';

RAISE NOTICE 'Successfully set up accident_reports tables for public access (no authentication)';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Apply storage bucket policies (see below)';
RAISE NOTICE '2. Configure vehicle-crash bucket as public in Supabase dashboard';
RAISE NOTICE '3. Test image upload functionality';

-- Storage bucket policies for public access (no authentication)
-- Apply these in Supabase Dashboard > Storage > Policies

-- For storage.objects table, create these policies:

-- Policy 1: Allow public uploads to vehicle-crash bucket
-- CREATE POLICY "Public upload to vehicle-crash" ON storage.objects
--     FOR INSERT TO anon
--     WITH CHECK (bucket_id = 'vehicle-crash');

-- Policy 2: Allow public reads from vehicle-crash bucket  
-- CREATE POLICY "Public read from vehicle-crash" ON storage.objects
--     FOR SELECT TO anon
--     USING (bucket_id = 'vehicle-crash');

-- Policy 3: Allow public updates to vehicle-crash bucket
-- CREATE POLICY "Public update in vehicle-crash" ON storage.objects
--     FOR UPDATE TO anon
--     USING (bucket_id = 'vehicle-crash')
--     WITH CHECK (bucket_id = 'vehicle-crash');

-- Policy 4: Allow public deletes from vehicle-crash bucket
-- CREATE POLICY "Public delete from vehicle-crash" ON storage.objects
--     FOR DELETE TO anon
--     USING (bucket_id = 'vehicle-crash'); 