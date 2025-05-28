-- Storage bucket policies for public access (no authentication required)
-- Apply these policies in Supabase Dashboard > Storage > Policies

-- First, make sure the bucket exists and is configured properly
-- Go to Storage > Buckets in Supabase dashboard and ensure:
-- - Bucket name: 'vehicle-crash'
-- - Public bucket: true
-- - File size limit: 10MB (or as needed)
-- - Allowed mime types: image/jpeg, image/png, image/webp, image/jpg

-- Policy 1: Allow public uploads to vehicle-crash bucket
CREATE POLICY "Public upload to vehicle-crash" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (bucket_id = 'vehicle-crash');

-- Policy 2: Allow public reads from vehicle-crash bucket  
CREATE POLICY "Public read from vehicle-crash" ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'vehicle-crash');

-- Policy 3: Allow public updates to vehicle-crash bucket (for metadata updates)
CREATE POLICY "Public update in vehicle-crash" ON storage.objects
    FOR UPDATE TO anon
    USING (bucket_id = 'vehicle-crash')
    WITH CHECK (bucket_id = 'vehicle-crash');

-- Policy 4: Allow public deletes from vehicle-crash bucket (for cleanup)
CREATE POLICY "Public delete from vehicle-crash" ON storage.objects
    FOR DELETE TO anon
    USING (bucket_id = 'vehicle-crash');

-- Alternative: More restrictive policy that only allows specific image types
-- Uncomment this if you want to restrict file types:
/*
CREATE POLICY "Public image upload to vehicle-crash" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (
        bucket_id = 'vehicle-crash' AND
        (storage.extension(name) = 'jpg' OR 
         storage.extension(name) = 'jpeg' OR 
         storage.extension(name) = 'png' OR 
         storage.extension(name) = 'webp')
    );
*/

-- Grant permissions to anonymous users for storage operations
GRANT ALL ON storage.objects TO anon;
GRANT ALL ON storage.buckets TO anon; 