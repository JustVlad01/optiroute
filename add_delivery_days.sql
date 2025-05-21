-- Add delivery days columns to the stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS delivery_monday TEXT DEFAULT 'No';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS delivery_tuesday TEXT DEFAULT 'No';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS delivery_wednesday TEXT DEFAULT 'No';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS delivery_thursday TEXT DEFAULT 'No';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS delivery_friday TEXT DEFAULT 'No';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS delivery_saturday TEXT DEFAULT 'No'; 