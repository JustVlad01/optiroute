-- Add delete policy for driver_form_assignments
CREATE POLICY IF NOT EXISTS "Anyone can delete form assignments" 
ON driver_form_assignments FOR DELETE USING (true); 