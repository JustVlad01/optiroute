-- Update the driver_forms table to make cab_cleaned related fields nullable
-- This will allow forms to be submitted without these fields

-- Make the cab_cleaned column nullable
ALTER TABLE driver_forms 
ALTER COLUMN cab_cleaned DROP NOT NULL,
ALTER COLUMN cab_cleaned SET DEFAULT NULL;

-- Make the cab_not_cleaned_reason column nullable
ALTER TABLE driver_forms 
ALTER COLUMN cab_not_cleaned_reason DROP NOT NULL,
ALTER COLUMN cab_not_cleaned_reason SET DEFAULT NULL;

-- Drop the index on cab_cleaned
DROP INDEX IF EXISTS idx_driver_forms_cab_cleaned;

-- Add a comment to document the change
COMMENT ON TABLE driver_forms IS 'Driver daily form data - cab_cleaned fields made optional in latest version'; 