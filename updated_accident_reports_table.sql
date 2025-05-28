-- Updated table structure to match your Angular component
-- This aligns with the actual form fields and data structure

-- Create table for storing vehicle accident reports
CREATE TABLE accident_reports (
    -- Primary key and metadata
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Driver information
    driver_id UUID NOT NULL, -- References your driver table
    
    -- Basic incident information
    date_of_collision DATE NOT NULL,
    location_of_collision TEXT NOT NULL, -- Stores the formatted location string from GPS
    
    -- My vehicle details (matches myVehicle object in Angular)
    my_vehicle_make VARCHAR(100),
    my_vehicle_registration VARCHAR(20),
    my_vehicle_colour VARCHAR(50),
    my_vehicle_driver_name VARCHAR(255),
    my_vehicle_address TEXT DEFAULT '24A Rampart Rd\nNewry\nN Ireland\nBT34 2QU',
    my_vehicle_transport_contact TEXT DEFAULT 'Raymond Kinley\nTransport Manager Around Noon\n24A Rampart Rd\nNewry\nBT34 2QU\n+44 28 3026 2333 / +44 7990 072 354',
    my_vehicle_insurance_details TEXT DEFAULT 'AXA Insurance\nWolfe Tone House\nWolfe Tone Street\nDublin 1',
    my_vehicle_policy_number VARCHAR(100) DEFAULT '5/56/406827696',
    
    -- Other vehicle details (matches otherVehicle object in Angular)
    other_vehicle_make VARCHAR(100),
    other_vehicle_registration VARCHAR(20),
    other_vehicle_colour VARCHAR(50),
    other_vehicle_driver_name VARCHAR(255),
    other_vehicle_address TEXT,
    other_vehicle_owner VARCHAR(255),
    other_vehicle_owner_address TEXT,
    other_vehicle_insurance_details TEXT,
    other_vehicle_policy_number VARCHAR(100),
    
    -- Damage and injury details (matches Angular component fields)
    my_damage_description TEXT,
    other_damage_description TEXT,
    my_injuries TEXT,
    other_injuries TEXT,
    
    -- Image URLs array (matches Angular component structure)
    image_urls TEXT[], -- Array of storage paths
    
    -- Form submission tracking
    submit_success BOOLEAN DEFAULT FALSE,
    submit_error TEXT,
    
    -- Additional metadata
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    form_version VARCHAR(10) DEFAULT '1.0'
);

-- Create table for detailed image tracking (optional - for advanced image management)
CREATE TABLE accident_report_images (
    id SERIAL PRIMARY KEY,
    accident_report_id INTEGER NOT NULL REFERENCES accident_reports(id) ON DELETE CASCADE,
    
    -- Storage bucket information (using vehicle-crash bucket)
    storage_bucket_path VARCHAR(500) NOT NULL, -- Path in vehicle-crash bucket
    storage_bucket_url VARCHAR(500), -- Full public URL
    
    -- Image metadata
    original_filename VARCHAR(255) NOT NULL,
    file_size_bytes INTEGER,
    mime_type VARCHAR(100),
    image_order INTEGER DEFAULT 1, -- Order of images (1-5 as per form limit)
    
    -- Upload tracking
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    upload_status VARCHAR(20) DEFAULT 'uploaded', -- pending, uploaded, failed
    upload_error TEXT,
    
    -- Processing flags
    is_processed BOOLEAN DEFAULT TRUE,
    thumbnail_path VARCHAR(500),
    
    CONSTRAINT unique_accident_image_order UNIQUE(accident_report_id, image_order)
);

-- Create indexes for performance
CREATE INDEX idx_accident_reports_driver_id ON accident_reports(driver_id);
CREATE INDEX idx_accident_reports_date ON accident_reports(date_of_collision);
CREATE INDEX idx_accident_reports_created_at ON accident_reports(created_at);
CREATE INDEX idx_accident_reports_my_registration ON accident_reports(my_vehicle_registration);
CREATE INDEX idx_accident_reports_other_registration ON accident_reports(other_vehicle_registration);
CREATE INDEX idx_accident_reports_submit_success ON accident_reports(submit_success);
CREATE INDEX idx_accident_report_images_report_id ON accident_report_images(accident_report_id);
CREATE INDEX idx_accident_report_images_upload_status ON accident_report_images(upload_status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_accident_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_accident_reports_updated_at 
    BEFORE UPDATE ON accident_reports 
    FOR EACH ROW 
    EXECUTE FUNCTION update_accident_reports_updated_at();

-- Add table comments
COMMENT ON TABLE accident_reports IS 'Stores vehicle accident report information from RTC Bump Card forms';
COMMENT ON TABLE accident_report_images IS 'Detailed tracking of images stored in vehicle-crash bucket';
COMMENT ON COLUMN accident_reports.driver_id IS 'References the driver who submitted the report';
COMMENT ON COLUMN accident_reports.location_of_collision IS 'GPS location string with coordinates and accuracy';
COMMENT ON COLUMN accident_reports.image_urls IS 'Array of storage paths for uploaded images';
COMMENT ON COLUMN accident_report_images.storage_bucket_path IS 'Path within the vehicle-crash storage bucket';

-- Sample data insertion matching your Angular component structure
-- This shows how to insert data that matches your current form
INSERT INTO accident_reports (
    driver_id,
    date_of_collision,
    location_of_collision,
    my_vehicle_make,
    my_vehicle_registration,
    my_vehicle_colour,
    my_vehicle_driver_name,
    other_vehicle_make,
    other_vehicle_registration,
    other_vehicle_colour,
    other_vehicle_driver_name,
    other_vehicle_address,
    other_vehicle_insurance_details,
    other_vehicle_policy_number,
    my_damage_description,
    other_damage_description,
    my_injuries,
    other_injuries,
    image_urls,
    submit_success
) VALUES (
    'driver-uuid-here', -- Replace with actual driver UUID
    '2024-01-15',
    'Latitude: 54.176944, Longitude: -6.349444 (Accuracy: ±5m)',
    'Ford',
    'AB12 CDE',
    'White',
    'John Smith',
    'Toyota',
    'XY98 ZAB',
    'Blue',
    'Jane Doe',
    '123 Main Street, Belfast, BT1 1AA',
    'Direct Line Insurance, Policy active since 2023',
    'DL123456789',
    'Minor scratches on rear bumper',
    'Front bumper damage, headlight cracked',
    'N/A',
    'N/A',
    ARRAY['driver-uuid_1705312345_0.jpg', 'driver-uuid_1705312345_1.jpg'],
    TRUE
); 