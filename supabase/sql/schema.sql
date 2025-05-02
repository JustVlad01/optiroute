-- Create the drivers table
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Standard Supabase ID
  custom_id TEXT UNIQUE NOT NULL,                -- The custom ID for login
  name TEXT,
  role TEXT NOT NULL DEFAULT 'driver',           -- Role can be 'admin' or 'driver'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  phone_number TEXT
  -- Add any other driver-specific fields here
);

-- Enable Row Level Security (RLS)
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- Create Policies (allowing public access for now)
-- WARNING: This allows anyone to read/write. Secure this later!

-- Policy for allowing public read access
CREATE POLICY "Allow public read access" ON drivers
  FOR SELECT USING (true);

-- Policy for allowing public insert access (for admin registration)
CREATE POLICY "Allow public insert access" ON drivers
  FOR INSERT WITH CHECK (true);

-- Optional: Index for faster custom_id lookups
CREATE INDEX idx_drivers_custom_id ON drivers(custom_id);

-- Main delivery forms table
CREATE TABLE delivery_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    driver_id UUID,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    driver_name TEXT NOT NULL,
    day_and_date DATE NOT NULL,
    route_number TEXT NOT NULL,
    van_registration TEXT NOT NULL,
    mileage_start NUMERIC NOT NULL,
    mileage_end NUMERIC NOT NULL,
    fuel_added BOOLEAN DEFAULT FALSE,
    tires_added BOOLEAN DEFAULT FALSE,
    kgs_on_fuel_card TEXT,
    has_full_uniform BOOLEAN DEFAULT FALSE,
    has_all_site_keys BOOLEAN DEFAULT FALSE,
    start_time TEXT NOT NULL,
    pre_load_van_temp NUMERIC NOT NULL,
    pre_load_product_temp NUMERIC NOT NULL,
    auxiliary_products_on_board BOOLEAN DEFAULT FALSE,
    number_of_crates_out INTEGER NOT NULL,
    number_of_crates_in INTEGER NOT NULL,
    probe_serial_number TEXT NOT NULL,
    issues_with_orders_products TEXT,
    issues_with_dockets_paperwork TEXT,
    recycled_returns BOOLEAN DEFAULT FALSE,
    van_fridge_working BOOLEAN DEFAULT FALSE,
    returned_van_probe BOOLEAN DEFAULT FALSE,
    cab_van_fridge_cleaned BOOLEAN DEFAULT FALSE,
    cleaning_reason TEXT,
    chemicals_used TEXT,
    van_issues TEXT,
    repairs_required TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

-- Site issues table
CREATE TABLE site_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_form_id UUID NOT NULL,
    site_name TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (delivery_form_id) REFERENCES delivery_forms(id) ON DELETE CASCADE
);

-- Order issues table
CREATE TABLE order_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_form_id UUID NOT NULL,
    order_reference TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (delivery_form_id) REFERENCES delivery_forms(id) ON DELETE CASCADE
);

-- Customer complaints table
CREATE TABLE customer_complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_form_id UUID NOT NULL,
    customer_name TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (delivery_form_id) REFERENCES delivery_forms(id) ON DELETE CASCADE
);

-- Product complaints table
CREATE TABLE product_complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_form_id UUID NOT NULL,
    product_name TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    FOREIGN KEY (delivery_form_id) REFERENCES delivery_forms(id) ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE delivery_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_complaints ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated access
CREATE POLICY "Drivers can view their own forms" 
    ON delivery_forms FOR SELECT 
    USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert their own forms" 
    ON delivery_forms FOR INSERT 
    WITH CHECK (auth.uid() = driver_id);

-- Allow admins to view all forms
CREATE POLICY "Admins can view all forms"
    ON delivery_forms FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM drivers
        WHERE drivers.id = auth.uid() AND drivers.role = 'admin'
    ));

-- Create policies for related tables
CREATE POLICY "Access via parent form" 
    ON site_issues FOR ALL 
    USING (delivery_form_id IN (
        SELECT id FROM delivery_forms WHERE driver_id = auth.uid()
    ));

CREATE POLICY "Access via parent form" 
    ON order_issues FOR ALL 
    USING (delivery_form_id IN (
        SELECT id FROM delivery_forms WHERE driver_id = auth.uid()
    ));

CREATE POLICY "Access via parent form" 
    ON customer_complaints FOR ALL 
    USING (delivery_form_id IN (
        SELECT id FROM delivery_forms WHERE driver_id = auth.uid()
    ));

CREATE POLICY "Access via parent form" 
    ON product_complaints FOR ALL 
    USING (delivery_form_id IN (
        SELECT id FROM delivery_forms WHERE driver_id = auth.uid()
    )); 