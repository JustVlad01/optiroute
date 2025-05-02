-- Create driver_forms table for the admin dashboard
CREATE TABLE IF NOT EXISTS driver_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  driver_name TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  van_registration TEXT NOT NULL,
  starting_mileage INTEGER NOT NULL,
  fuel_added BOOLEAN DEFAULT FALSE NOT NULL,
  litres_added DECIMAL(10, 2),
  fuel_card_reg TEXT,
  full_uniform BOOLEAN DEFAULT FALSE NOT NULL,
  all_site_keys BOOLEAN DEFAULT FALSE NOT NULL,
  work_start_time TIME NOT NULL,
  preload_van_temp DECIMAL(5, 2),
  preload_product_temp DECIMAL(5, 2),
  auxiliary_products BOOLEAN DEFAULT FALSE NOT NULL,
  number_of_crates_out INTEGER NOT NULL,
  van_probe_serial_number TEXT,
  paperwork_issues BOOLEAN DEFAULT FALSE NOT NULL,
  paperwork_issues_reason TEXT
); 