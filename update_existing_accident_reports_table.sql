-- Update existing accident_reports table to remove authentication requirements
-- Run this script if the tables already exist

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

-- Enable Row Level Security if not already enabled
ALTER TABLE accident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE accident_report_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow public insert on accident_reports" ON accident_reports;
DROP POLICY IF EXISTS "Allow public select on accident_reports" ON accident_reports;
DROP POLICY IF EXISTS "Allow public insert on accident_report_images" ON accident_report_images;
DROP POLICY IF EXISTS "Allow public select on accident_report_images" ON accident_report_images;

-- Create new policies for public access (no authentication required)
-- Allow public INSERT on accident_reports
CREATE POLICY "Allow public insert on accident_reports" ON accident_reports
    FOR INSERT TO anon
    WITH CHECK (true);

-- Allow public SELECT on accident_reports (for admin dashboard)
CREATE POLICY "Allow public select on accident_reports" ON accident_reports
    FOR SELECT TO anon
    USING (true);

-- Allow public INSERT on accident_report_images
CREATE POLICY "Allow public insert on accident_report_images" ON accident_report_images
    FOR INSERT TO anon
    WITH CHECK (true);

-- Allow public SELECT on accident_report_images (for admin dashboard)
CREATE POLICY "Allow public select on accident_report_images" ON accident_report_images
    FOR SELECT TO anon
    USING (true);

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

RAISE NOTICE 'Successfully updated accident_reports table structure for public access';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Apply storage bucket policies from supabase_storage_policies.sql';
RAISE NOTICE '2. Configure vehicle-crash bucket as public in Supabase dashboard';
RAISE NOTICE '3. Test image upload functionality'; 