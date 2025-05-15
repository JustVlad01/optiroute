-- SQL Script for Matching Stores between excel_import_routes and stores table
-- This script will:
-- 1. Create a new table to store matched results
-- 2. Create a function to match excel import stores with the master store list
-- 3. Populate the matched_stores table with combined information

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS match_stores_from_import();
DROP FUNCTION IF EXISTS view_matched_stores();
DROP FUNCTION IF EXISTS view_unmatched_stores();

-- Create matched_stores table if it doesn't exist
CREATE TABLE IF NOT EXISTS matched_stores (
  id SERIAL PRIMARY KEY,
  import_id INT REFERENCES excel_import_routes(id),
  store_id INT REFERENCES stores(store_id),
  match_confidence FLOAT, -- Match confidence score between 0 and 1
  route_name TEXT,
  excel_store_name TEXT,
  master_store_name TEXT,
  dispatch_code TEXT,
  store_code TEXT,
  store_company TEXT,
  address_line TEXT,
  geolocation TEXT,
  eircode TEXT,
  door_code TEXT,
  alarm_code TEXT,
  fridge_code TEXT,
  keys_available TEXT,
  hour_access_24 TEXT,
  earliest_delivery_time TEXT,
  opening_time_saturday TEXT,
  opening_time_sunday TEXT,
  total_quantity INT,
  crates_needed INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS matched_stores_import_id_idx ON matched_stores(import_id);
CREATE INDEX IF NOT EXISTS matched_stores_store_id_idx ON matched_stores(store_id);

-- Function to match stores using partial text matching
CREATE OR REPLACE FUNCTION match_stores_from_import()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_matched INTEGER := 0;
  v_excel_record RECORD;
  v_store_record RECORD;
  v_match_score FLOAT;
  v_match_threshold FLOAT := 0.3; -- Minimum match confidence to consider a match
  v_best_match_score FLOAT;
  v_best_match_id INTEGER;
BEGIN
  -- Create the pg_trgm extension if it doesn't exist for better text similarity matching
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  
  -- Truncate the matched_stores table to start fresh
  TRUNCATE TABLE matched_stores RESTART IDENTITY;
  
  -- Loop through each store in excel_import_routes
  FOR v_excel_record IN 
    SELECT id, route_name, store_name, total_quantity, crates_needed 
    FROM excel_import_routes
  LOOP
    v_count := v_count + 1;
    v_best_match_score := 0;
    v_best_match_id := NULL;
    
    -- Find potential matches in the stores table
    FOR v_store_record IN 
      SELECT
        store_id,
        store_name,
        dispatch_code,
        store_code,
        store_company,
        address_line,
        geolocation,
        eircode,
        door_code,
        alarm_code,
        fridge_code,
        keys_available,
        hour_access_24,
        earliest_delivery_time,
        opening_time_saturday,
        opening_time_sunday,
        -- Calculate similarity score using multiple fields for better matching
        GREATEST(
          similarity(v_excel_record.store_name, store_name),
          similarity(v_excel_record.store_name, COALESCE(dispatch_code, '') || ' ' || store_name),
          similarity(v_excel_record.store_name, COALESCE(store_code, '') || ' ' || store_name),
          similarity(v_excel_record.store_name, COALESCE(dispatch_code, '') || ' ' || COALESCE(store_company, '') || ' ' || store_name)
        ) AS match_score
      FROM stores
      WHERE 
        -- Quick filtering to reduce comparison set
        similarity(v_excel_record.store_name, store_name) > 0.2 OR
        v_excel_record.store_name ILIKE '%' || store_name || '%' OR
        store_name ILIKE '%' || v_excel_record.store_name || '%' OR
        v_excel_record.store_name ILIKE '%' || COALESCE(dispatch_code, '') || '%' OR
        v_excel_record.store_name ILIKE '%' || COALESCE(store_code, '') || '%'
      ORDER BY match_score DESC
      LIMIT 5 -- Check only top 5 potential matches for efficiency
    LOOP
      -- Update best match if a better one is found
      IF v_store_record.match_score > v_best_match_score THEN
        v_best_match_score := v_store_record.match_score;
        v_best_match_id := v_store_record.store_id;
      END IF;
    END LOOP;
    
    -- If a good match is found, insert into the matched_stores table
    IF v_best_match_id IS NOT NULL AND v_best_match_score >= v_match_threshold THEN
      v_matched := v_matched + 1;
      
      -- Insert the combined record
      INSERT INTO matched_stores (
        import_id,
        store_id,
        match_confidence,
        route_name,
        excel_store_name,
        master_store_name,
        dispatch_code,
        store_code,
        store_company,
        address_line,
        geolocation,
        eircode,
        door_code,
        alarm_code,
        fridge_code,
        keys_available,
        hour_access_24,
        earliest_delivery_time,
        opening_time_saturday,
        opening_time_sunday,
        total_quantity,
        crates_needed
      )
      SELECT
        v_excel_record.id,
        s.store_id,
        v_best_match_score,
        v_excel_record.route_name,
        v_excel_record.store_name,
        s.store_name,
        s.dispatch_code,
        s.store_code,
        s.store_company,
        s.address_line,
        s.geolocation,
        s.eircode,
        s.door_code,
        s.alarm_code,
        s.fridge_code,
        s.keys_available,
        s.hour_access_24,
        s.earliest_delivery_time,
        s.opening_time_saturday,
        s.opening_time_sunday,
        v_excel_record.total_quantity,
        v_excel_record.crates_needed
      FROM stores s
      WHERE s.store_id = v_best_match_id;
    END IF;
  END LOOP;

  -- Return a summary of the operation
  RETURN jsonb_build_object(
    'success', TRUE,
    'total_processed', v_count,
    'total_matched', v_matched,
    'message', 'Successfully matched ' || v_matched || ' out of ' || v_count || ' stores.'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

-- Function to view matched stores with match results
CREATE OR REPLACE FUNCTION view_matched_stores()
RETURNS TABLE (
  id INT,
  excel_store_name TEXT,
  master_store_name TEXT,
  match_confidence FLOAT,
  route_name TEXT,
  dispatch_code TEXT,
  store_code TEXT,
  store_company TEXT,
  total_quantity INT,
  crates_needed INT,
  hour_access_24 TEXT,
  earliest_delivery_time TEXT,
  address_line TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ms.id,
    ms.excel_store_name,
    ms.master_store_name,
    ms.match_confidence,
    ms.route_name,
    ms.dispatch_code,
    ms.store_code,
    ms.store_company,
    ms.total_quantity,
    ms.crates_needed,
    ms.hour_access_24,
    ms.earliest_delivery_time,
    ms.address_line
  FROM matched_stores ms
  ORDER BY ms.route_name, ms.match_confidence DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get unmatched excel imported stores
CREATE OR REPLACE FUNCTION view_unmatched_stores()
RETURNS TABLE (
  id INT,
  route_name TEXT,
  store_name TEXT,
  total_quantity INT,
  crates_needed INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.route_name,
    e.store_name,
    e.total_quantity,
    e.crates_needed
  FROM excel_import_routes e
  LEFT JOIN matched_stores ms ON e.id = ms.import_id
  WHERE ms.id IS NULL
  ORDER BY e.route_name, e.store_name;
END;
$$ LANGUAGE plpgsql;

-- EXAMPLE USAGE:
-- Run the matching process:
-- SELECT * FROM match_stores_from_import();
--
-- View matched stores:
-- SELECT * FROM view_matched_stores();
--
-- View unmatched stores:
-- SELECT * FROM view_unmatched_stores(); 