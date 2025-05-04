-- SQL script to fix the column names in crate_tracking table
-- Renames columns from lowercase to camelCase to match the code

-- Check if columns already exist in camelCase
DO $$
BEGIN
    -- Check if the columns exist in lowercase
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'crate_tracking' 
        AND column_name = 'cratesout'
    ) THEN
        -- Rename cratesout to cratesOut (camelCase)
        ALTER TABLE crate_tracking RENAME COLUMN cratesout TO "cratesOut";
    END IF;

    -- Check if the columns exist in lowercase
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'crate_tracking' 
        AND column_name = 'cratesin'
    ) THEN
        -- Rename cratesin to cratesIn (camelCase)
        ALTER TABLE crate_tracking RENAME COLUMN cratesin TO "cratesIn";
    END IF;
END;
$$;

-- Confirm the changes
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'crate_tracking'; 