-- Add columns for partial form data saving
ALTER TABLE driver_form_assignments 
ADD COLUMN IF NOT EXISTS partial_form_data JSONB,
ADD COLUMN IF NOT EXISTS partially_completed BOOLEAN DEFAULT false; 