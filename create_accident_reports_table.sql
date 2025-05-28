-- Create table for storing vehicle accident reports
CREATE TABLE accident_reports (
    -- Primary key and metadata
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Basic incident information
    date_of_collision DATE NOT NULL,
    location_of_collision JSONB, -- Store lat/lng and address as JSON
    location_error TEXT,
    
    -- My vehicle details
    my_vehicle_make VARCHAR(100),
    my_vehicle_registration VARCHAR(20),
    my_vehicle_colour VARCHAR(50),
    my_driver_name VARCHAR(255),
    my_vehicle_address TEXT,
    my_transport_contact TEXT,
    my_insurance_details TEXT,
    my_policy_number VARCHAR(100),
    
    -- Other vehicle details
    other_vehicle_make VARCHAR(100),
    other_vehicle_registration VARCHAR(20),
    other_vehicle_colour VARCHAR(50),
    other_driver_name VARCHAR(255),
    other_vehicle_address TEXT,
    other_vehicle_owner VARCHAR(255),
    other_vehicle_owner_address TEXT,
    other_insurance_details TEXT,
    other_policy_number VARCHAR(100),
    
    -- Damage and injury details
    other_damage_description TEXT,
    my_injuries TEXT,
    
    -- Form submission status
    submit_success BOOLEAN DEFAULT FALSE,
    submit_error TEXT,
    
    -- Session information (no authentication required)
    session_id VARCHAR(255),
    
    -- Additional metadata
    form_version VARCHAR(10) DEFAULT '1.0',
    ip_address INET,
    user_agent TEXT
);

-- Create table for storing accident report images
CREATE TABLE accident_report_images (
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

-- Create indexes for better query performance
CREATE INDEX idx_accident_reports_date ON accident_reports(date_of_collision);
CREATE INDEX idx_accident_reports_created_at ON accident_reports(created_at);
CREATE INDEX idx_accident_reports_location ON accident_reports USING GIN(location_of_collision);
CREATE INDEX idx_accident_reports_my_registration ON accident_reports(my_vehicle_registration);
CREATE INDEX idx_accident_reports_other_registration ON accident_reports(other_vehicle_registration);
CREATE INDEX idx_accident_report_images_report_id ON accident_report_images(accident_report_id);
CREATE INDEX idx_accident_report_images_upload_status ON accident_report_images(upload_status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accident_reports_updated_at 
    BEFORE UPDATE ON accident_reports 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE accident_reports IS 'Stores vehicle accident report information from RTC Bump Card forms';
COMMENT ON TABLE accident_report_images IS 'Stores image references and metadata for accident reports';
COMMENT ON COLUMN accident_reports.location_of_collision IS 'JSON object containing latitude, longitude, and address information';
COMMENT ON COLUMN accident_report_images.storage_bucket_path IS 'Full path to image file in storage bucket';
COMMENT ON COLUMN accident_report_images.image_order IS 'Order of images in the report (1-5, matching form limit)';

-- Row Level Security (RLS) Policies for public access
-- Enable RLS on tables
ALTER TABLE accident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE accident_report_images ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
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

-- Storage bucket policies (to be applied in Supabase dashboard)
-- For the 'vehicle-crash' bucket, set the following policies:
/*
STORAGE BUCKET POLICIES TO APPLY IN SUPABASE DASHBOARD:

1. Create bucket policy for public uploads:
   Policy name: "Allow public uploads"
   Allowed operation: INSERT
   Target roles: anon
   Policy definition: true

2. Create bucket policy for public reads:
   Policy name: "Allow public reads"
   Allowed operation: SELECT
   Target roles: anon
   Policy definition: true

3. Bucket configuration:
   - Public bucket: true
   - File size limit: 10MB (adjust as needed)
   - Allowed mime types: image/jpeg, image/png, image/webp
*/

-- Example of how location_of_collision JSON might look:
-- {
--   "latitude": 51.5074,
--   "longitude": -0.1278,
--   "address": "London, UK",
--   "accuracy": 10,
--   "timestamp": "2024-01-15T10:30:00Z"
-- } 