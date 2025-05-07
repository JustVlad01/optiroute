-- Add ID column as primary key
ALTER TABLE store_information ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;

-- Add unique constraint for dispatch_code and store_code pair
-- First check if it already exists to avoid errors
DO $$ 
BEGIN
  -- Only add the constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'store_information_dispatch_code_store_code_key'
  ) THEN
    BEGIN
      ALTER TABLE store_information 
        ADD CONSTRAINT store_information_dispatch_code_store_code_key 
        UNIQUE (dispatch_code, store_code);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Error adding unique constraint: %', SQLERRM;
      -- You might have duplicate pairs already in your data
      -- Consider handling them or removing duplicates first
    END;
  END IF;
END $$;

-- Create index on store_name
CREATE INDEX IF NOT EXISTS idx_store_information_store_name 
  ON store_information(store_name);

-- Handle duplicate records by keeping only one record for each dispatch_code/store_code pair
-- This is needed because we can't add UNIQUE constraint if duplicates exist
-- Warning: This will remove duplicate records!
WITH duplicates AS (
  SELECT 
    dispatch_code, 
    store_code, 
    COUNT(*), 
    MIN(id) as id_to_keep
  FROM 
    store_information
  WHERE 
    dispatch_code IS NOT NULL 
    AND store_code IS NOT NULL
  GROUP BY 
    dispatch_code, store_code
  HAVING 
    COUNT(*) > 1
)
DELETE FROM store_information
WHERE id IN (
  SELECT s.id 
  FROM store_information s
  JOIN duplicates d ON 
    s.dispatch_code = d.dispatch_code 
    AND s.store_code = d.store_code
  WHERE s.id <> d.id_to_keep
);

-- Update the service_app.updateStoreInformation function to use the primary key 