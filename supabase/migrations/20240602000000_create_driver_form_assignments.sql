-- Create driver_form_assignments table to connect drivers to forms that need to be filled
CREATE TABLE IF NOT EXISTS driver_form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'overdue'
  due_date DATE,
  completed_at TIMESTAMPTZ,
  form_id UUID REFERENCES driver_forms(id), -- Will be null for uncompleted forms
  notes TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_form_assignments_driver_id ON driver_form_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_status ON driver_form_assignments(status);
CREATE INDEX IF NOT EXISTS idx_form_assignments_due_date ON driver_form_assignments(due_date);

-- Enable Row Level Security
ALTER TABLE driver_form_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Anyone can view form assignments" 
ON driver_form_assignments FOR SELECT USING (true);

CREATE POLICY "Anyone can insert form assignments" 
ON driver_form_assignments FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update form assignments" 
ON driver_form_assignments FOR UPDATE USING (true);

-- Comments for documentation
COMMENT ON TABLE driver_form_assignments IS 'Tracks form assignments to drivers';
COMMENT ON COLUMN driver_form_assignments.driver_id IS 'The driver assigned to complete the form';
COMMENT ON COLUMN driver_form_assignments.status IS 'Status of the form: pending, completed, or overdue';
COMMENT ON COLUMN driver_form_assignments.due_date IS 'The date by which the form should be completed';
COMMENT ON COLUMN driver_form_assignments.completed_at IS 'Timestamp when the form was completed';
COMMENT ON COLUMN driver_form_assignments.form_id IS 'Reference to the completed form, null if not completed yet';
COMMENT ON COLUMN driver_form_assignments.notes IS 'Optional notes about the assignment'; 