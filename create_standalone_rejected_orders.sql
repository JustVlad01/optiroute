-- Drop the existing rejected_order_forms table if it exists
DROP TABLE IF EXISTS rejected_order_forms CASCADE;

-- Create a standalone rejected orders table
CREATE TABLE rejected_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Driver and basic info
    driver_id UUID REFERENCES drivers(id),
    driver_name TEXT NOT NULL,
    date DATE NOT NULL,
    route_number TEXT NOT NULL,
    van_registration TEXT NOT NULL,
    
    -- Store information
    store_id TEXT REFERENCES stores(id),
    store_name TEXT NOT NULL,
    
    -- Delivery information
    arrival_time_at_store TIME NOT NULL,
    wait_time_in_store INTEGER NOT NULL, -- minutes
    driving_start_time TIME NOT NULL,
    site_keys TEXT NOT NULL, -- 'yes' or 'no'
    drop_number_on_route INTEGER NOT NULL,
    number_of_crates_into_store INTEGER NOT NULL,
    van_temp_by_display DECIMAL(5,2) NOT NULL,
    
    -- Damage assessment
    order_damaged_before_loading TEXT NOT NULL, -- 'yes' or 'no'
    all_products_damaged TEXT NOT NULL, -- 'yes' or 'no'
    marked_shortages_on_docket TEXT NOT NULL, -- 'yes' or 'no'
    know_how_product_damaged TEXT NOT NULL, -- 'yes' or 'no'
    
    -- Comments
    comments_vehicle_issues TEXT,
    comments_delivery_issues TEXT,
    comments_complaints TEXT,
    comments_returns TEXT,
    comments_accidents TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_rejected_orders_driver_id ON rejected_orders(driver_id);
CREATE INDEX idx_rejected_orders_date ON rejected_orders(date);
CREATE INDEX idx_rejected_orders_store_id ON rejected_orders(store_id);
CREATE INDEX idx_rejected_orders_created_at ON rejected_orders(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rejected_orders_updated_at 
    BEFORE UPDATE ON rejected_orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE rejected_orders ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (since there's no auth for now)
CREATE POLICY "Allow all access to rejected_orders" ON rejected_orders
    FOR ALL USING (true);

-- Insert a test record (optional)
-- You can remove this if you don't want test data
INSERT INTO rejected_orders (
    driver_id, driver_name, date, route_number, van_registration,
    store_id, store_name, arrival_time_at_store, wait_time_in_store,
    driving_start_time, site_keys, drop_number_on_route,
    number_of_crates_into_store, van_temp_by_display,
    order_damaged_before_loading, all_products_damaged,
    marked_shortages_on_docket, know_how_product_damaged,
    comments_vehicle_issues
) VALUES (
    (SELECT id FROM drivers LIMIT 1),
    'Test Driver',
    CURRENT_DATE,
    'R001',
    'ABC123',
    (SELECT id FROM stores LIMIT 1),
    'Test Store',
    '10:30:00',
    15,
    '10:45:00',
    'yes',
    3,
    12,
    4.5,
    'no',
    'yes',
    'yes',
    'no',
    'Minor scuff on van door'
); 