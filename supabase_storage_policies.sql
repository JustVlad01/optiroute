-- Supabase Storage Bucket Policies for Public Access
-- Apply these policies in your Supabase dashboard under Storage > Policies

-- First, ensure the bucket exists and is configured as public
-- Bucket name: 'vehicle-crash'
-- Public bucket: true
-- File size limit: 10MB
-- Allowed mime types: image/jpeg, image/png, image/webp, image/jpg

-- Policy 1: Allow public uploads to vehicle-crash bucket
CREATE POLICY "Allow public uploads to vehicle-crash bucket" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (bucket_id = 'vehicle-crash');

-- Policy 2: Allow public reads from vehicle-crash bucket
CREATE POLICY "Allow public reads from vehicle-crash bucket" ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'vehicle-crash');

-- Policy 3: Allow public updates to vehicle-crash bucket (optional, for metadata updates)
CREATE POLICY "Allow public updates to vehicle-crash bucket" ON storage.objects
    FOR UPDATE TO anon
    USING (bucket_id = 'vehicle-crash')
    WITH CHECK (bucket_id = 'vehicle-crash');

-- Policy 4: Allow public deletes from vehicle-crash bucket (optional, for cleanup)
CREATE POLICY "Allow public deletes from vehicle-crash bucket" ON storage.objects
    FOR DELETE TO anon
    USING (bucket_id = 'vehicle-crash');

-- Alternative: If you want to be more restrictive and only allow specific file types
-- CREATE POLICY "Allow public image uploads to vehicle-crash bucket" ON storage.objects
--     FOR INSERT TO anon
--     WITH CHECK (
--         bucket_id = 'vehicle-crash' AND
--         (storage.extension(name) = 'jpg' OR 
--          storage.extension(name) = 'jpeg' OR 
--          storage.extension(name) = 'png' OR 
--          storage.extension(name) = 'webp')
--     );

-- Note: After creating these policies, make sure to:
-- 1. Set the bucket as public in the Supabase dashboard
-- 2. Configure appropriate file size limits
-- 3. Set allowed MIME types if needed
-- 4. Test the upload functionality from your client application 