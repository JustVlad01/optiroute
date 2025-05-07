-- Fix the foreign key constraint for driver_id in driver_form_assignments table
-- This will allow you to delete drivers and automatically delete their form assignments

-- First, drop the existing constraint
ALTER TABLE driver_form_assignments DROP CONSTRAINT IF EXISTS driver_form_assignments_driver_id_fkey;

-- Add the constraint back with ON DELETE CASCADE
ALTER TABLE driver_form_assignments 
  ADD CONSTRAINT driver_form_assignments_driver_id_fkey 
  FOREIGN KEY (driver_id) 
  REFERENCES drivers(id) 
  ON DELETE CASCADE;

-- Add comment to explain the cascade behavior
COMMENT ON CONSTRAINT driver_form_assignments_driver_id_fkey ON driver_form_assignments 
  IS 'When a driver is deleted, automatically delete all their form assignments';

-- Check if there are any recurring form settings that might also need a similar change
ALTER TABLE recurring_form_settings DROP CONSTRAINT IF EXISTS recurring_form_settings_driver_id_fkey;

-- Add the constraint back with ON DELETE CASCADE
ALTER TABLE recurring_form_settings 
  ADD CONSTRAINT recurring_form_settings_driver_id_fkey 
  FOREIGN KEY (driver_id) 
  REFERENCES drivers(id) 
  ON DELETE CASCADE;

-- Add comment to explain the cascade behavior
COMMENT ON CONSTRAINT recurring_form_settings_driver_id_fkey ON recurring_form_settings 
  IS 'When a driver is deleted, automatically delete their recurring form settings';

-- After running this SQL, you should be able to delete drivers without constraint errors 