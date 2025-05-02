-- Add reset_period column to driver_form_assignments table
ALTER TABLE driver_form_assignments 
ADD COLUMN IF NOT EXISTS reset_period INTEGER; 