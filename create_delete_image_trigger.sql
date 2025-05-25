-- Create a function that will be called by the trigger when a store_image is deleted
CREATE OR REPLACE FUNCTION remove_deleted_image_from_store()
RETURNS TRIGGER AS $$
DECLARE
  current_images TEXT;
  updated_images TEXT;
  image_code TEXT;
  store_id TEXT;
BEGIN
  -- Get the store_id from the deleted row
  store_id := OLD.store_id;
  
  -- Generate the image code using the same pattern as in the upload function
  -- This matches the pattern in the update_store_images function
  image_code := 'IMG_' || substring(store_id, 1, 8) || '_' || extract(epoch from OLD.uploaded_at)::text;
  
  -- Get current images from the store
  SELECT images INTO current_images FROM stores WHERE id = store_id;
  
  -- If there are no images, no need to update
  IF current_images IS NULL OR current_images = '' THEN
    RETURN OLD;
  END IF;
  
  -- Try to parse as JSON array and remove the deleted image
  BEGIN
    -- Create a new array without the deleted image code
    -- This uses PostgreSQL's JSON functions to filter out the specific image code
    updated_images := (
      SELECT json_agg(value)::text
      FROM json_array_elements_text(current_images::json) AS value
      WHERE value != image_code
    );
    
    -- If the result is null (empty array), set to empty JSON array
    IF updated_images IS NULL THEN
      updated_images := '[]';
    END IF;
    
    -- Update the stores table with the modified array
    UPDATE stores 
    SET images = updated_images
    WHERE id = store_id;
    
  EXCEPTION WHEN OTHERS THEN
    -- If there's an error (e.g., not valid JSON), just leave it as is
    RAISE NOTICE 'Error updating images field for store %: %', store_id, SQLERRM;
  END;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger that runs after a delete on store_images
CREATE TRIGGER store_images_after_delete
AFTER DELETE ON store_images
FOR EACH ROW
EXECUTE FUNCTION remove_deleted_image_from_store();

-- Log a message indicating the trigger was created
DO $$
BEGIN
  RAISE NOTICE 'Created trigger to automatically remove deleted images from the stores table';
END $$; 