-- Add missing column for partial form data
ALTER TABLE driver_form_assignments 
ADD COLUMN IF NOT EXISTS partial_form_data JSONB;

-- Add partially_completed flag
ALTER TABLE driver_form_assignments 
ADD COLUMN IF NOT EXISTS partially_completed BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN driver_form_assignments.partial_form_data IS 'JSON data for partially completed forms';
COMMENT ON COLUMN driver_form_assignments.partially_completed IS 'Flag indicating if a form has been partially completed'; 