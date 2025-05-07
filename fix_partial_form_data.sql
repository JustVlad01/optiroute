-- Fix for "could not find the 'partial_form_data' column of 'driver_form_assignments'" error

-- Add missing column for partial form data (if it doesn't exist)
ALTER TABLE driver_form_assignments 
ADD COLUMN IF NOT EXISTS partial_form_data JSONB;

-- Add partially_completed flag (if it doesn't exist)
ALTER TABLE driver_form_assignments 
ADD COLUMN IF NOT EXISTS partially_completed BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN driver_form_assignments.partial_form_data IS 'JSON data for partially completed forms';
COMMENT ON COLUMN driver_form_assignments.partially_completed IS 'Flag indicating if a form has been partially completed';

-- Add indexes to improve form assignment retrieval performance for client app
CREATE INDEX IF NOT EXISTS idx_form_assignments_driver_id_status ON driver_form_assignments(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_form_assignments_partially_completed ON driver_form_assignments(partially_completed);

-- Ensure default status is properly set for new assignments
ALTER TABLE driver_form_assignments 
ALTER COLUMN status SET DEFAULT 'pending';

-- Verify the column was added successfully
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'driver_form_assignments' 
AND column_name = 'partial_form_data'; 