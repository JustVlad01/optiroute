-- Create a table to store processed orders with store information extraction
CREATE TABLE IF NOT EXISTS processed_orders (
    id SERIAL PRIMARY KEY,
    import_id INTEGER REFERENCES order_imports(id) ON DELETE CASCADE,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    total_stores INTEGER NOT NULL DEFAULT 0,
    matched_stores INTEGER NOT NULL DEFAULT 0,
    unmatched_stores INTEGER NOT NULL DEFAULT 0
);

-- Create a table for processed store orders with extracted store information
CREATE TABLE IF NOT EXISTS processed_store_orders (
    id SERIAL PRIMARY KEY,
    processed_order_id INTEGER REFERENCES processed_orders(id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    store_order_id INTEGER REFERENCES store_orders(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_code VARCHAR(50),
    address TEXT,
    eircode VARCHAR(10),
    dispatch_code VARCHAR(50),
    store_code VARCHAR(50),
    store_name VARCHAR(255),
    total_items INTEGER NOT NULL,
    matched_store_id INTEGER, -- Reference to stores.store_id if matched
    match_quality VARCHAR(20) DEFAULT 'none' CHECK (match_quality IN ('none', 'partial', 'full', 'checking')),
    UNIQUE(processed_order_id, store_order_id)
);

-- Index for faster queries
CREATE INDEX idx_processed_orders_import_id ON processed_orders(import_id);
CREATE INDEX idx_processed_store_orders_processed_order_id ON processed_store_orders(processed_order_id);
CREATE INDEX idx_processed_store_orders_route_id ON processed_store_orders(route_id);
CREATE INDEX idx_processed_store_orders_match_quality ON processed_store_orders(match_quality);

-- Function to match store orders with store information
CREATE OR REPLACE FUNCTION match_store_with_masterfile(
    p_customer_name TEXT,
    p_customer_code TEXT
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
    dispatch_match TEXT;
    store_match TEXT;
    exact_match BOOLEAN := FALSE;
BEGIN
    -- Try to extract dispatch code and store code from customer name
    -- Format examples: "1001C. Circle K - Gallowshill (30893)"
    BEGIN
        -- First, try to match by exact customer code if available (like "30893")
        IF p_customer_code IS NOT NULL AND p_customer_code != '' THEN
            SELECT json_build_object(
                'id', store_id,
                'dispatch_code', dispatch_code,
                'store_code', store_code,
                'store_name', store_name,
                'address', address_line,
                'eircode', eircode,
                'customer_code', p_customer_code,
                'match_type', 'exact_code'
            )::JSONB
            INTO result
            FROM stores
            WHERE store_code = p_customer_code
            LIMIT 1;
            
            IF result IS NOT NULL THEN
                exact_match := TRUE;
                RETURN result;
            END IF;
        END IF;
        
        -- Next, try to extract dispatch code from start of customer name (like "1001C")
        dispatch_match := substring(p_customer_name from '^(\d+[A-Za-z]?)');
        
        -- If we have a potential dispatch match, look for an exact match with this code
        IF dispatch_match IS NOT NULL AND dispatch_match != '' THEN
            SELECT json_build_object(
                'id', store_id,
                'dispatch_code', dispatch_code,
                'store_code', store_code,
                'store_name', store_name,
                'address', address_line,
                'eircode', eircode,
                'customer_code', p_customer_code,
                'match_type', 'exact_dispatch'
            )::JSONB
            INTO result
            FROM stores
            WHERE dispatch_code = dispatch_match
            LIMIT 1;
            
            IF result IS NOT NULL THEN
                exact_match := TRUE;
                RETURN result;
            END IF;
        END IF;
        
        -- Try to get store code from parentheses (like "(30893)")
        store_match := substring(p_customer_name from '\((\d+)\)');
        
        -- If we have both codes, try to match on the combination
        IF dispatch_match IS NOT NULL AND dispatch_match != '' AND 
           store_match IS NOT NULL AND store_match != '' THEN
            SELECT json_build_object(
                'id', store_id,
                'dispatch_code', dispatch_code,
                'store_code', store_code,
                'store_name', store_name,
                'address', address_line,
                'eircode', eircode,
                'customer_code', store_match,
                'match_type', 'exact_combined'
            )::JSONB
            INTO result
            FROM stores
            WHERE dispatch_code = dispatch_match AND store_code = store_match
            LIMIT 1;
            
            IF result IS NOT NULL THEN
                exact_match := TRUE;
                RETURN result;
            END IF;
        END IF;
        
        -- If no exact match found, try partial match on store name
        IF NOT exact_match THEN
            -- Clean the customer name for better matching (remove codes and parentheses)
            DECLARE
                clean_name TEXT;
            BEGIN
                -- Remove leading dispatch code if present
                clean_name := regexp_replace(p_customer_name, '^(\d+[A-Za-z]?)\s*\.?\s*', '');
                -- Remove parenthetical parts
                clean_name := regexp_replace(clean_name, '\s*\([^)]+\)', '');
                -- Clean up extra spaces
                clean_name := trim(clean_name);
                
                -- Check for store name within cleaned customer name
                SELECT json_build_object(
                    'id', store_id,
                    'dispatch_code', dispatch_code,
                    'store_code', store_code,
                    'store_name', store_name,
                    'address', address_line,
                    'eircode', eircode,
                    'customer_code', p_customer_code,
                    'match_type', 'partial_name'
                )::JSONB
                INTO result
                FROM stores
                WHERE 
                    (clean_name ILIKE '%' || store_name || '%') OR 
                    (store_name ILIKE '%' || clean_name || '%')
                ORDER BY 
                    -- Shorter store names that contain the full name are better matches
                    CASE WHEN store_name ILIKE '%' || clean_name || '%' THEN 
                        length(store_name) - length(clean_name)
                    ELSE 
                        999 -- Lower priority for partial matches
                    END
                LIMIT 1;
                
                RETURN result;
            END;
        END IF;
        
        -- Return NULL if no match found
        RETURN NULL;
    EXCEPTION WHEN OTHERS THEN
        -- Log error and return NULL
        RAISE NOTICE 'Error in match_store_with_masterfile: %', SQLERRM;
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql;

-- Function to extract store information for an entire order import
CREATE OR REPLACE FUNCTION extract_store_information(p_import_id INTEGER)
RETURNS TABLE (
    processed_order_id INTEGER,
    total_stores INTEGER,
    matched_stores INTEGER,
    unmatched_stores INTEGER
) AS $$
DECLARE
    new_processed_order_id INTEGER;
    store_count INTEGER := 0;
    match_count INTEGER := 0;
    no_match_count INTEGER := 0;
    store_record RECORD;
    match_result JSONB;
BEGIN
    -- Create a new processed order record
    INSERT INTO processed_orders (
        import_id, 
        processed_at, 
        status,
        total_stores,
        matched_stores,
        unmatched_stores
    ) VALUES (
        p_import_id,
        CURRENT_TIMESTAMP,
        'processing',
        0, 0, 0
    ) RETURNING id INTO new_processed_order_id;

    -- Process each store order from the import
    FOR store_record IN 
        SELECT 
            s.id as store_id,
            r.id as route_id,
            s.customer_name,
            s.customer_code,
            s.total_items
        FROM 
            store_orders s
        JOIN 
            routes r ON s.route_id = r.id
        WHERE 
            r.import_id = p_import_id
    LOOP
        store_count := store_count + 1;
        
        -- Try to match with store information
        match_result := match_store_with_masterfile(
            store_record.customer_name, 
            store_record.customer_code
        );
        
        IF match_result IS NOT NULL THEN
            -- Store matched
            match_count := match_count + 1;
            
            -- Insert with matched information
            INSERT INTO processed_store_orders (
                processed_order_id,
                route_id,
                store_order_id,
                customer_name,
                customer_code,
                address,
                eircode,
                dispatch_code,
                store_code,
                store_name,
                total_items,
                matched_store_id,
                match_quality
            ) VALUES (
                new_processed_order_id,
                store_record.route_id,
                store_record.store_id,
                store_record.customer_name,
                COALESCE(match_result->>'customer_code', store_record.customer_code),
                match_result->>'address',
                match_result->>'eircode',
                match_result->>'dispatch_code',
                match_result->>'store_code',
                match_result->>'store_name',
                store_record.total_items,
                (match_result->>'id')::INTEGER,
                CASE 
                    WHEN match_result->>'match_type' IN ('exact_code', 'exact_dispatch', 'exact_combined') THEN 'full'
                    WHEN match_result->>'match_type' = 'partial_name' THEN 'partial'
                    ELSE 'checking'
                END
            );
        ELSE
            -- No match found
            no_match_count := no_match_count + 1;
            
            -- Insert without matched information
            INSERT INTO processed_store_orders (
                processed_order_id,
                route_id,
                store_order_id,
                customer_name,
                customer_code,
                total_items,
                match_quality
            ) VALUES (
                new_processed_order_id,
                store_record.route_id,
                store_record.store_id,
                store_record.customer_name,
                store_record.customer_code,
                store_record.total_items,
                'checking'
            );
        END IF;
    END LOOP;
    
    -- Update the processed order with final counts
    UPDATE processed_orders SET
        status = 'completed',
        total_stores = store_count,
        matched_stores = match_count,
        unmatched_stores = no_match_count
    WHERE id = new_processed_order_id;
    
    -- Return the results
    RETURN QUERY SELECT 
        new_processed_order_id,
        store_count,
        match_count,
        no_match_count;
END;
$$ LANGUAGE plpgsql; 