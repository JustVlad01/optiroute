-- Fix the foreign key constraint for driver_id in driver_form_assignments table
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