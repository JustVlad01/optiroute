-- Store Images Table Schema
-- This table stores image metadata and links images to stores via store_id

CREATE TABLE IF NOT EXISTS store_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, -- Path to the image in storage (e.g., "stores/store-id/filename.jpg")
  url TEXT NOT NULL, -- Full public URL to the image
  file_name TEXT NOT NULL, -- Original filename
  is_storefront BOOLEAN DEFAULT false, -- Whether this is a storefront image
  instructions TEXT, -- Special instructions or annotations for the image
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_store_images_store_id ON store_images(store_id);
CREATE INDEX IF NOT EXISTS idx_store_images_is_storefront ON store_images(is_storefront);
CREATE INDEX IF NOT EXISTS idx_store_images_uploaded_at ON store_images(uploaded_at);

-- Enable Row Level Security
ALTER TABLE store_images ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Anyone can view store images" 
ON store_images FOR SELECT USING (true);

CREATE POLICY "Anyone can insert store images" 
ON store_images FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update store images" 
ON store_images FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete store images" 
ON store_images FOR DELETE USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_store_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_store_images_updated_at_trigger
  BEFORE UPDATE ON store_images
  FOR EACH ROW
  EXECUTE FUNCTION update_store_images_updated_at();

-- Create storage bucket for store images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-images', 'store-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for store-images bucket
CREATE POLICY "Anyone can view store image files"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-images');

CREATE POLICY "Anyone can upload store image files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'store-images');

CREATE POLICY "Anyone can update store image files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'store-images');

CREATE POLICY "Anyone can delete store image files"
ON storage.objects FOR DELETE
USING (bucket_id = 'store-images');

-- Comments for documentation
COMMENT ON TABLE store_images IS 'Stores metadata for store images uploaded to Supabase Storage';
COMMENT ON COLUMN store_images.store_id IS 'The store this image belongs to';
COMMENT ON COLUMN store_images.file_path IS 'Path to the image in storage bucket';
COMMENT ON COLUMN store_images.url IS 'Full public URL to access the image';
COMMENT ON COLUMN store_images.file_name IS 'Original filename of the uploaded image';
COMMENT ON COLUMN store_images.is_storefront IS 'Whether this image shows the storefront';
COMMENT ON COLUMN store_images.instructions IS 'Special delivery instructions or annotations for this image';
COMMENT ON COLUMN store_images.uploaded_at IS 'When the image was uploaded';
COMMENT ON COLUMN store_images.created_at IS 'When the record was created';
COMMENT ON COLUMN store_images.updated_at IS 'When the record was last updated'; 