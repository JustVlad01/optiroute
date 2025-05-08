-- First drop existing functions to avoid type conflicts
DROP FUNCTION IF EXISTS execute_sql_update(text);
DROP FUNCTION IF EXISTS invalidate_store_cache();
DROP FUNCTION IF EXISTS update_store_by_id(bigint, jsonb);

-- Function to execute a SQL update statement directly 
-- This version avoids specifying a return type to handle dynamic SQL results
CREATE OR REPLACE FUNCTION execute_sql_update(sql_query text)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    EXECUTE sql_query INTO result;
    RETURN result;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error executing SQL: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to invalidate the store cache (for development use)
CREATE OR REPLACE FUNCTION invalidate_store_cache()
RETURNS void AS $$
BEGIN
    -- No actual cache invalidation needed for this case
    -- This is just a placeholder function
    PERFORM 1;
END;
$$ LANGUAGE plpgsql;

-- Make sure all time fields are properly typed in the schema
ALTER TABLE store_information 
  ALTER COLUMN earliest_delivery_time TYPE TEXT,
  ALTER COLUMN opening_time_saturday TYPE TEXT,
  ALTER COLUMN openining_time_bankholiday TYPE TEXT;

-- Add function to ensure time fields allow 'closed' as a valid value
CREATE OR REPLACE FUNCTION update_store_time_fields(
  p_id INT, 
  p_earliest_delivery_time TEXT DEFAULT NULL,
  p_opening_time_saturday TEXT DEFAULT NULL,
  p_openining_time_bankholiday TEXT DEFAULT NULL
)
RETURNS SETOF store_information AS $$
BEGIN
  RETURN QUERY
  UPDATE store_information
  SET
    earliest_delivery_time = COALESCE(p_earliest_delivery_time, earliest_delivery_time),
    opening_time_saturday = COALESCE(p_opening_time_saturday, opening_time_saturday),
    openining_time_bankholiday = COALESCE(p_openining_time_bankholiday, openining_time_bankholiday)
  WHERE id = p_id
  RETURNING *;
END;
$$ LANGUAGE plpgsql; 