-- Create a table to store matched store information from order list and master file
CREATE TABLE IF NOT EXISTS matched_store_information (
    id SERIAL PRIMARY KEY,
    import_id INTEGER REFERENCES order_imports(id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    store_order_id INTEGER REFERENCES store_orders(id) ON DELETE CASCADE,
    store_information_id INTEGER REFERENCES store_information(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    total_items INTEGER NOT NULL,
    match_quality FLOAT NOT NULL DEFAULT 0, -- Score from 0 to 1 indicating match quality
    -- Store order fields
    order_customer_name VARCHAR(255),
    order_customer_code VARCHAR(50),
    -- Store information fields
    dispatch_code TEXT,
    store_code TEXT,
    store_company TEXT,
    store_name TEXT,
    address TEXT,
    eircode TEXT,
    location_link TEXT,
    door_code TEXT,
    alarm_code TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_matched_store_information_import_id ON matched_store_information(import_id);
CREATE INDEX IF NOT EXISTS idx_matched_store_information_route_id ON matched_store_information(route_id);
CREATE INDEX IF NOT EXISTS idx_matched_store_information_store_order_id ON matched_store_information(store_order_id);
CREATE INDEX IF NOT EXISTS idx_matched_store_information_store_information_id ON matched_store_information(store_information_id);
CREATE INDEX IF NOT EXISTS idx_matched_store_information_match_quality ON matched_store_information(match_quality);

-- Function to calculate similarity between two text strings
CREATE OR REPLACE FUNCTION text_similarity(a TEXT, b TEXT) RETURNS FLOAT AS $$
DECLARE
    normalized_a TEXT;
    normalized_b TEXT;
BEGIN
    -- Handle NULL values
    IF a IS NULL OR b IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Normalize strings for better comparison
    normalized_a = LOWER(TRIM(a));
    normalized_b = LOWER(TRIM(b));
    
    -- If strings are identical after normalization, return 1
    IF normalized_a = normalized_b THEN
        RETURN 1;
    END IF;
    
    -- Return similarity based on Levenshtein distance
    -- Scale score between 0 and 1, where 1 is exact match
    RETURN 1 - (levenshtein(normalized_a, normalized_b)::FLOAT / 
               GREATEST(LENGTH(normalized_a), LENGTH(normalized_b)));
END;
$$ LANGUAGE plpgsql;

-- Function to match store orders with store information and create linked table
CREATE OR REPLACE FUNCTION match_orders_with_store_masterfile(p_import_id INTEGER, p_similarity_threshold FLOAT DEFAULT 0.1)
RETURNS TABLE (
    matched_count INTEGER,
    total_count INTEGER,
    match_quality_avg FLOAT
) AS $$
DECLARE
    matched_count INTEGER := 0;
    total_count INTEGER := 0;
    match_quality_sum FLOAT := 0;
    store_record RECORD;
    best_match RECORD;
    sim_score FLOAT;
    best_score FLOAT;
    route_record RECORD;
BEGIN
    -- First, delete any existing matches for this import
    DELETE FROM matched_store_information WHERE import_id = p_import_id;
    
    -- Process each route in the import
    FOR route_record IN 
        SELECT id, route_name FROM routes WHERE import_id = p_import_id
    LOOP
        -- For each store order in the route
        FOR store_record IN 
            SELECT 
                so.id,
                so.customer_name,
                so.customer_code,
                so.total_items
            FROM 
                store_orders so
            WHERE 
                so.route_id = route_record.id
        LOOP
            total_count := total_count + 1;
            best_score := 0;
            best_match := NULL;
            
            -- Find the best matching store in store_information
            -- Try direct match on codes first if they exist
            IF store_record.customer_code IS NOT NULL AND store_record.customer_code != '' THEN
                -- Try to match by store_code or part of the customer name in parentheses
                SELECT 
                    si.*,
                    1.0 AS score -- Perfect match if codes match
                INTO best_match
                FROM 
                    store_information si
                WHERE 
                    si.store_code = store_record.customer_code OR
                    store_record.customer_name LIKE '%(' || si.store_code || ')%'
                LIMIT 1;
                
                IF best_match IS NOT NULL THEN
                    best_score := 1.0;
                END IF;
            END IF;
            
            -- If no direct match on codes, try to extract dispatch_code from start of customer name
            IF best_match IS NULL THEN
                DECLARE
                    possible_dispatch_code TEXT;
                BEGIN
                    -- Try to extract something like "1001C" from the beginning
                    possible_dispatch_code := substring(store_record.customer_name from '^(\d+[A-Za-z]?)');
                    
                    IF possible_dispatch_code IS NOT NULL AND possible_dispatch_code != '' THEN
                        SELECT 
                            si.*,
                            0.9 AS score -- High but not perfect match
                        INTO best_match
                        FROM 
                            store_information si
                        WHERE 
                            si.dispatch_code = possible_dispatch_code
                        LIMIT 1;
                        
                        IF best_match IS NOT NULL THEN
                            best_score := 0.9;
                        END IF;
                    END IF;
                END;
            END IF;
            
            -- If no match by codes, try fuzzy matching on store names
            IF best_match IS NULL THEN
                -- Extract the actual store name from customer_name by removing codes
                DECLARE
                    clean_name TEXT;
                BEGIN
                    -- Remove leading code if present (like "1001C. ")
                    clean_name := regexp_replace(store_record.customer_name, '^(\d+[A-Za-z]?)\s*\.?\s*', '');
                    -- Remove anything in parentheses
                    clean_name := regexp_replace(clean_name, '\s*\([^)]+\)', '');
                    -- Clean up extra spaces
                    clean_name := trim(clean_name);
                    
                    -- Find the best match based on name similarity
                    FOR best_match IN 
                        SELECT 
                            si.*,
                            text_similarity(clean_name, si.store_name) AS score
                        FROM 
                            store_information si
                        WHERE 
                            text_similarity(clean_name, si.store_name) > p_similarity_threshold
                        ORDER BY 
                            score DESC
                        LIMIT 1
                    LOOP
                        best_score := best_match.score;
                        EXIT; -- Just take the first (best) match
                    END LOOP;
                END;
            END IF;
            
            -- If we found a good match, insert it into the matched_store_information table
            IF best_match IS NOT NULL AND best_score >= p_similarity_threshold THEN
                INSERT INTO matched_store_information (
                    import_id,
                    route_id,
                    store_order_id,
                    store_information_id,
                    customer_name,
                    total_items,
                    match_quality,
                    order_customer_name,
                    order_customer_code,
                    dispatch_code,
                    store_code,
                    store_company,
                    store_name,
                    address,
                    eircode,
                    location_link,
                    door_code,
                    alarm_code
                ) VALUES (
                    p_import_id,
                    route_record.id,
                    store_record.id,
                    best_match.id,
                    store_record.customer_name,
                    store_record.total_items,
                    best_score,
                    store_record.customer_name,
                    store_record.customer_code,
                    best_match.dispatch_code,
                    best_match.store_code,
                    COALESCE(best_match.store_name_1, ''), -- Using store_name_1 as store_company equivalent
                    best_match.store_name,
                    best_match.address_line_1,
                    best_match.eircode,
                    best_match.location_link,
                    best_match.door_code,
                    best_match.alarm_code
                );
                
                matched_count := matched_count + 1;
                match_quality_sum := match_quality_sum + best_score;
            END IF;
        END LOOP;
    END LOOP;
    
    -- Return statistics about the matching process
    RETURN QUERY
    SELECT 
        matched_count,
        total_count,
        CASE WHEN matched_count > 0 THEN match_quality_sum / matched_count ELSE 0 END AS match_quality_avg;
END;
$$ LANGUAGE plpgsql;

-- Function to get the matched store information with additional details
CREATE OR REPLACE FUNCTION get_matched_store_information(p_import_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    route_name TEXT,
    customer_name VARCHAR(255),
    total_items INTEGER,
    match_quality FLOAT,
    dispatch_code TEXT,
    store_code TEXT,
    store_company TEXT,
    store_name TEXT,
    address TEXT,
    eircode TEXT,
    location_link TEXT,
    door_code TEXT,
    alarm_code TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        msi.id,
        r.route_name,
        msi.customer_name,
        msi.total_items,
        msi.match_quality,
        msi.dispatch_code,
        msi.store_code,
        msi.store_company,
        msi.store_name,
        msi.address,
        msi.eircode,
        msi.location_link,
        msi.door_code,
        msi.alarm_code
    FROM 
        matched_store_information msi
    JOIN
        routes r ON msi.route_id = r.id
    WHERE 
        msi.import_id = p_import_id
    ORDER BY
        r.route_name,
        msi.match_quality DESC;
END;
$$ LANGUAGE plpgsql; 