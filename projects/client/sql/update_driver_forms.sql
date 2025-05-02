-- Update the driver_forms table to add the new end-of-shift fields
ALTER TABLE driver_forms 
ADD COLUMN IF NOT EXISTS closing_mileage INTEGER,
ADD COLUMN IF NOT EXISTS recycled_all_returns BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS van_fridge_working BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS returned_van_probe BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cab_cleaned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cab_not_cleaned_reason TEXT,
ADD COLUMN IF NOT EXISTS chemicals_used TEXT,
ADD COLUMN IF NOT EXISTS van_issues TEXT,
ADD COLUMN IF NOT EXISTS repairs_needed TEXT,
ADD COLUMN IF NOT EXISTS number_of_crates_in INTEGER,
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- Add comments to document the new columns
COMMENT ON COLUMN driver_forms.closing_mileage IS 'Ending mileage at the end of shift';
COMMENT ON COLUMN driver_forms.recycled_all_returns IS 'Whether all returns/waste/cardboard have been recycled';
COMMENT ON COLUMN driver_forms.van_fridge_working IS 'Whether the van fridge is working correctly';
COMMENT ON COLUMN driver_forms.returned_van_probe IS 'Whether the van probe has been returned';
COMMENT ON COLUMN driver_forms.cab_cleaned IS 'Whether the cab/van and fridge have been cleaned per SOP 24';
COMMENT ON COLUMN driver_forms.cab_not_cleaned_reason IS 'Reason why the cab was not cleaned if applicable';
COMMENT ON COLUMN driver_forms.chemicals_used IS 'Chemicals used during cleaning issued by hygiene supervisor';
COMMENT ON COLUMN driver_forms.van_issues IS 'Any issues, incidents or accidents with the van';
COMMENT ON COLUMN driver_forms.repairs_needed IS 'Any repairs or maintenance required for the van';
COMMENT ON COLUMN driver_forms.number_of_crates_in IS 'Number of crates returned at the end of shift';
COMMENT ON COLUMN driver_forms.needs_review IS 'Flag indicating whether the form needs admin review due to issues';

-- Create indexes for more commonly queried fields
CREATE INDEX IF NOT EXISTS idx_driver_forms_closing_mileage ON driver_forms (closing_mileage);
CREATE INDEX IF NOT EXISTS idx_driver_forms_cab_cleaned ON driver_forms (cab_cleaned);
CREATE INDEX IF NOT EXISTS idx_driver_forms_van_probe_returned ON driver_forms (returned_van_probe);
CREATE INDEX IF NOT EXISTS idx_driver_forms_needs_review ON driver_forms (needs_review); 