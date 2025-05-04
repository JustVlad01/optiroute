-- Update the comment on the status column in driver_form_assignments
COMMENT ON COLUMN driver_form_assignments.status IS 'Status of the form: pending, completed, overdue, or signed';

-- Add an index on completed_at for faster filtering by submission date
CREATE INDEX IF NOT EXISTS idx_form_assignments_completed_at ON driver_form_assignments(completed_at); 