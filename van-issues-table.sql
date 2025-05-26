-- Simple SQL query to create van-issues table for storing driver van issue reports
-- No authentication required - completely open access

CREATE TABLE "van-issues" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    van_registration VARCHAR(20) NOT NULL,
    driver_comments TEXT NOT NULL,
    image_urls TEXT[], -- Array of image URLs
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create basic indexes for performance
CREATE INDEX "idx_van-issues_driver_id" ON "van-issues"(driver_id);
CREATE INDEX "idx_van-issues_created_at" ON "van-issues"(created_at);

-- NO Row Level Security - completely open access
-- ALTER TABLE "van-issues" ENABLE ROW LEVEL SECURITY; -- Commented out

-- Grant full permissions to everyone
GRANT ALL ON "van-issues" TO anon;
GRANT ALL ON "van-issues" TO authenticated;
GRANT ALL ON "van-issues" TO service_role;

-- Create a view for easier querying with driver information
CREATE VIEW van_issues_with_driver AS
SELECT 
    vi.*,
    d.name as driver_name,
    d.email as driver_email,
    d.phone_number as driver_phone
FROM "van-issues" vi
JOIN drivers d ON vi.driver_id = d.id;

-- Grant full permissions on the view
GRANT ALL ON van_issues_with_driver TO anon;
GRANT ALL ON van_issues_with_driver TO authenticated;
GRANT ALL ON van_issues_with_driver TO service_role; 