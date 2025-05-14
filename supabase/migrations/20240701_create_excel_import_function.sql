-- Create table for storing parsed excel data
CREATE TABLE IF NOT EXISTS excel_import_routes (
  id BIGSERIAL PRIMARY KEY,
  route_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  crates_needed INTEGER NOT NULL,
  import_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  import_batch_id UUID DEFAULT gen_random_uuid()
);

-- Create function to save parsed Excel data
CREATE OR REPLACE FUNCTION save_excel_parsed_data(p_store_orders JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_count INTEGER := 0;
  v_item JSONB;
  v_total_quantity INTEGER;
  v_crates_needed INTEGER;
  v_crate_capacity INTEGER := 25; -- Each crate can hold 25 items
BEGIN
  -- Clear the existing data and reset the ID sequence
  TRUNCATE TABLE excel_import_routes RESTART IDENTITY;
  
  -- Loop through each store order in the array
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_store_orders)
  LOOP
    -- Calculate the number of crates needed (round up to next integer)
    v_total_quantity := (v_item->>'totalQuantity')::INTEGER;
    v_crates_needed := CEILING(v_total_quantity::NUMERIC / v_crate_capacity);
    
    -- Insert into the excel_import_routes table
    INSERT INTO excel_import_routes (
      route_name,
      store_name,
      total_quantity,
      crates_needed,
      import_batch_id
    ) VALUES (
      v_item->>'routeName',
      v_item->>'storeName',
      v_total_quantity,
      v_crates_needed,
      v_batch_id
    );
    
    v_count := v_count + 1;
  END LOOP;

  -- Return information about the import
  RETURN jsonb_build_object(
    'success', TRUE,
    'batch_id', v_batch_id,
    'count', v_count,
    'message', 'Successfully imported ' || v_count || ' store orders'
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