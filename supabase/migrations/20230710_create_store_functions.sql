-- Function to update a store by ID
CREATE OR REPLACE FUNCTION update_store_by_id(p_id bigint, p_update_data jsonb)
RETURNS SETOF store_information AS $$
BEGIN
    RETURN QUERY
    UPDATE store_information
    SET 
        door_code = COALESCE(p_update_data->>'door_code', door_code),
        alarm_code = COALESCE(p_update_data->>'alarm_code', alarm_code),
        fridge_code = COALESCE(p_update_data->>'fridge_code', fridge_code),
        store_name = COALESCE(p_update_data->>'store_name', store_name),
        store_code = COALESCE(p_update_data->>'store_code', store_code),
        store_full_name = COALESCE(p_update_data->>'store_full_name', store_full_name),
        address_line_1 = COALESCE(p_update_data->>'address_line_1', address_line_1),
        manual = COALESCE(p_update_data->>'manual', manual),
        dispatch_code = COALESCE(p_update_data->>'dispatch_code', dispatch_code),
        location_link = COALESCE(p_update_data->>'location_link', location_link),
        old_route = COALESCE(p_update_data->>'old_route', old_route),
        new_route_15_04 = COALESCE(p_update_data->>'new_route_15_04', new_route_15_04)
    WHERE id = p_id
    RETURNING *;
END;
$$ LANGUAGE plpgsql;

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