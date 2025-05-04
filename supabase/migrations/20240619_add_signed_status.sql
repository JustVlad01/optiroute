-- Update the comment on the status column in driver_form_assignments
COMMENT ON COLUMN driver_form_assignments.status IS 'Status of the form: pending, completed, overdue, or signed';

-- Add needs_review column to driver_forms if it doesn't exist yet
ALTER TABLE driver_forms 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- Add comment for the needs_review column
COMMENT ON COLUMN driver_forms.needs_review IS 'Flag indicating whether the form needs admin review due to issues';

-- Create index on needs_review for faster queries
CREATE INDEX IF NOT EXISTS idx_driver_forms_needs_review ON driver_forms (needs_review); 