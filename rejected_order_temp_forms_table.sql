-- Create table for Rejected Order Temperature Forms
CREATE TABLE rejected_order_temp_forms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Basic Information
    driver_id UUID REFERENCES drivers(id),
    driver_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    route_number VARCHAR(100) NOT NULL,
    van_registration VARCHAR(50) NOT NULL,
    
    -- Store Information
    store_name VARCHAR(255) NOT NULL,
    store_id UUID,
    
    -- Delivery Information
    arrival_time_at_store TIME NOT NULL,
    wait_time_at_store INTEGER NOT NULL CHECK (wait_time_at_store >= 0),
    site_keys VARCHAR(10) NOT NULL CHECK (site_keys IN ('yes', 'no')),
    driving_start_time TIME NOT NULL,
    drop_number_on_route INTEGER NOT NULL CHECK (drop_number_on_route >= 1),
    total_crates_into_store INTEGER NOT NULL CHECK (total_crates_into_store >= 0),
    
    -- Temperature Monitoring
    van_temp_by_display DECIMAL(5,2) NOT NULL,
    probe_serial_number VARCHAR(100) NOT NULL,
    probe_temperature DECIMAL(5,2) NOT NULL,
    customer_temperature DECIMAL(5,2) NOT NULL,
    
    -- Testing Information
    destroyed_pack_for_testing VARCHAR(10) NOT NULL CHECK (destroyed_pack_for_testing IN ('yes', 'no')),
    used_pack_in_van_for_testing VARCHAR(10) NOT NULL CHECK (used_pack_in_van_for_testing IN ('yes', 'no')),
    
    -- Environmental & Product Information
    weather_conditions VARCHAR(255) NOT NULL,
    full_name_of_products_sampled TEXT NOT NULL,
    
    -- Photo Documentation (store file URLs from Supabase storage)
    photo_temp_reading_customer TEXT,
    photo_van_display_temp TEXT,
    photo_probe_reading_destructive_pack TEXT,
    
    -- Additional Information
    further_comments TEXT,
    
    -- Form metadata
    form_type VARCHAR(50) DEFAULT 'rejected_order_temp_checklist',
    form_assignment_id UUID,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_rejected_temp_forms_driver_id ON rejected_order_temp_forms(driver_id);
CREATE INDEX idx_rejected_temp_forms_date ON rejected_order_temp_forms(date);
CREATE INDEX idx_rejected_temp_forms_created_at ON rejected_order_temp_forms(created_at);
CREATE INDEX idx_rejected_temp_forms_assignment_id ON rejected_order_temp_forms(form_assignment_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rejected_temp_forms_updated_at 
    BEFORE UPDATE ON rejected_order_temp_forms 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) if needed
ALTER TABLE rejected_order_temp_forms ENABLE ROW LEVEL SECURITY;

-- Example policy (you can modify based on your authentication needs)
-- Since you mentioned no authentication for now, you might want to disable RLS or create permissive policies
CREATE POLICY "Allow all operations on rejected_order_temp_forms" ON rejected_order_temp_forms
    FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions (adjust based on your database user setup)
GRANT ALL ON rejected_order_temp_forms TO postgres;
GRANT ALL ON rejected_order_temp_forms TO anon;
GRANT ALL ON rejected_order_temp_forms TO authenticated; 