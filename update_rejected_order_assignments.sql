-- Remove auto-assigned rejected order forms since they should be on-demand only
DELETE FROM driver_form_assignments 
WHERE form_type = 'rejected_order_checklist' 
AND status = 'pending';

-- Update the trigger to NOT auto-assign rejected order forms to new drivers
DROP FUNCTION IF EXISTS assign_forms_to_new_driver() CASCADE;

CREATE OR REPLACE FUNCTION assign_forms_to_new_driver()
RETURNS TRIGGER AS $$
BEGIN
    -- Only assign daily driver forms, not rejected order forms
    INSERT INTO driver_form_assignments (driver_id, form_type, status, due_date)
    VALUES (NEW.id, 'daily_driver', 'pending', (CURRENT_DATE + INTERVAL '30 days'));
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger  
CREATE TRIGGER trigger_assign_forms_to_new_driver
    AFTER INSERT ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION assign_forms_to_new_driver(); 