-- Create driver_forms table
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

-- Create index for faster queries by driver name
CREATE INDEX IF NOT EXISTS idx_driver_forms_driver_name ON driver_forms (driver_name);

-- Create index for date-based queries
CREATE INDEX IF NOT EXISTS idx_driver_forms_date ON driver_forms (date);

-- Create index for combined date and driver filtering
CREATE INDEX IF NOT EXISTS idx_driver_forms_date_driver ON driver_forms (date, driver_name);

-- Add Row Level Security policies (to be modified based on your authentication needs)
ALTER TABLE driver_forms ENABLE ROW LEVEL SECURITY;

-- Create policy for select
CREATE POLICY "Anyone can view driver forms" 
ON driver_forms FOR SELECT USING (true);

-- Create policy for insert
CREATE POLICY "Anyone can add driver forms" 
ON driver_forms FOR INSERT WITH CHECK (true);

-- Comment on table and columns
COMMENT ON TABLE driver_forms IS 'Table for storing driver daily forms data';
COMMENT ON COLUMN driver_forms.driver_name IS 'Name of the driver';
COMMENT ON COLUMN driver_forms.date IS 'Date when the form was filled';
COMMENT ON COLUMN driver_forms.time IS 'Time when the form was filled';
COMMENT ON COLUMN driver_forms.van_registration IS 'Registration number of the van';
COMMENT ON COLUMN driver_forms.starting_mileage IS 'Starting mileage of the van';
COMMENT ON COLUMN driver_forms.fuel_added IS 'Whether fuel was added or not';
COMMENT ON COLUMN driver_forms.litres_added IS 'Amount of fuel added in litres';
COMMENT ON COLUMN driver_forms.fuel_card_reg IS 'Registration on the fuel card used';
COMMENT ON COLUMN driver_forms.full_uniform IS 'Whether the driver has full uniform';
COMMENT ON COLUMN driver_forms.all_site_keys IS 'Whether the driver has all site keys';
COMMENT ON COLUMN driver_forms.work_start_time IS 'Time when work started';
COMMENT ON COLUMN driver_forms.preload_van_temp IS 'Preload van temperature';
COMMENT ON COLUMN driver_forms.preload_product_temp IS 'Preload product temperature by probe';
COMMENT ON COLUMN driver_forms.auxiliary_products IS 'Whether all auxiliary products are on board';
COMMENT ON COLUMN driver_forms.number_of_crates_out IS 'Number of crates out';
COMMENT ON COLUMN driver_forms.van_probe_serial_number IS 'Serial number of the van probe';
COMMENT ON COLUMN driver_forms.paperwork_issues IS 'Whether there are issues with dockets/paperwork';
COMMENT ON COLUMN driver_forms.paperwork_issues_reason IS 'Reason for paperwork issues'; 