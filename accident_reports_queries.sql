-- Sample INSERT query for accident report
-- This shows how to insert a complete accident report
INSERT INTO accident_reports (
    date_of_collision,
    location_of_collision,
    my_vehicle_make,
    my_vehicle_registration,
    my_vehicle_colour,
    my_driver_name,
    my_vehicle_address,
    my_transport_contact,
    my_insurance_details,
    my_policy_number,
    other_vehicle_make,
    other_vehicle_registration,
    other_vehicle_colour,
    other_driver_name,
    other_vehicle_address,
    other_vehicle_owner,
    other_vehicle_owner_address,
    other_insurance_details,
    other_policy_number,
    other_damage_description,
    my_injuries,
    submit_success,
    session_id,
    ip_address,
    user_agent
) VALUES (
    '2024-01-15',
    '{"latitude": 51.5074, "longitude": -0.1278, "address": "London, UK", "accuracy": 10, "timestamp": "2024-01-15T10:30:00Z"}',
    'Toyota',
    'AB12 CDE',
    'Blue',
    'John Smith',
    '123 Main Street, London, UK',
    'Transport Company Ltd, 0800 123 456',
    'ABC Insurance Company, Policy starts: 2023-01-01',
    'POL123456789',
    'Ford',
    'XY98 ZAB',
    'Red',
    'Jane Doe',
    '456 Oak Avenue, Manchester, UK',
    NULL,
    NULL,
    'XYZ Insurance Ltd',
    'POL987654321',
    'Front bumper damage, scratches on left side',
    'N/A',
    TRUE,
    'session_abc123',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
);

-- Sample INSERT query for accident report images
-- This shows how to link images to an accident report
INSERT INTO accident_report_images (
    accident_report_id,
    storage_bucket_path,
    storage_bucket_url,
    original_filename,
    file_size_bytes,
    mime_type,
    image_order,
    upload_status
) VALUES 
(1, 'accident-reports/2024/01/15/report-1/image-1.jpg', 'https://doftypeumwgvirppcuim.supabase.co/storage/v1/object/public/vehicle-crash/accident-reports/2024/01/15/report-1/image-1.jpg', 'front_damage.jpg', 2048576, 'image/jpeg', 1, 'uploaded'),
(1, 'accident-reports/2024/01/15/report-1/image-2.jpg', 'https://doftypeumwgvirppcuim.supabase.co/storage/v1/object/public/vehicle-crash/accident-reports/2024/01/15/report-1/image-2.jpg', 'side_view.jpg', 1536789, 'image/jpeg', 2, 'uploaded'),
(1, 'accident-reports/2024/01/15/report-1/image-3.jpg', 'https://doftypeumwgvirppcuim.supabase.co/storage/v1/object/public/vehicle-crash/accident-reports/2024/01/15/report-1/image-3.jpg', 'license_plate.jpg', 987654, 'image/jpeg', 3, 'uploaded');

-- Query to retrieve a complete accident report with all images
SELECT 
    ar.*,
    COALESCE(
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', ari.id,
                'storage_bucket_path', ari.storage_bucket_path,
                'storage_bucket_url', ari.storage_bucket_url,
                'original_filename', ari.original_filename,
                'file_size_bytes', ari.file_size_bytes,
                'mime_type', ari.mime_type,
                'image_order', ari.image_order,
                'uploaded_at', ari.uploaded_at,
                'upload_status', ari.upload_status
            ) ORDER BY ari.image_order
        ) FILTER (WHERE ari.id IS NOT NULL),
        '[]'::json
    ) AS images
FROM accident_reports ar
LEFT JOIN accident_report_images ari ON ar.id = ari.accident_report_id
WHERE ar.id = $1
GROUP BY ar.id;

-- Query to get all accident reports with basic info and image count
SELECT 
    ar.id,
    ar.created_at,
    ar.date_of_collision,
    ar.location_of_collision->>'address' AS location_address,
    ar.my_driver_name,
    ar.other_driver_name,
    ar.my_vehicle_registration,
    ar.other_vehicle_registration,
    ar.submit_success,
    COUNT(ari.id) AS image_count
FROM accident_reports ar
LEFT JOIN accident_report_images ari ON ar.id = ari.accident_report_id AND ari.upload_status = 'uploaded'
GROUP BY ar.id
ORDER BY ar.created_at DESC;

-- Query to find reports by location (within a certain radius)
-- This uses PostGIS functions if you have the extension installed
SELECT 
    ar.id,
    ar.date_of_collision,
    ar.location_of_collision->>'address' AS location_address,
    ar.my_driver_name,
    ar.other_driver_name
FROM accident_reports ar
WHERE ar.location_of_collision IS NOT NULL
  AND ST_DWithin(
    ST_SetSRID(ST_MakePoint(
      (ar.location_of_collision->>'longitude')::float,
      (ar.location_of_collision->>'latitude')::float
    ), 4326),
    ST_SetSRID(ST_MakePoint($1, $2), 4326), -- $1 = longitude, $2 = latitude
    $3 -- $3 = radius in meters
  );

-- Query to find reports by date range
SELECT 
    ar.id,
    ar.created_at,
    ar.date_of_collision,
    ar.location_of_collision->>'address' AS location_address,
    ar.my_driver_name,
    ar.other_driver_name,
    ar.my_vehicle_registration,
    ar.other_vehicle_registration
FROM accident_reports ar
WHERE ar.date_of_collision BETWEEN $1 AND $2
ORDER BY ar.date_of_collision DESC;

-- Query to find reports by vehicle registration
SELECT 
    ar.id,
    ar.created_at,
    ar.date_of_collision,
    ar.location_of_collision->>'address' AS location_address,
    ar.my_driver_name,
    ar.other_driver_name,
    ar.my_vehicle_registration,
    ar.other_vehicle_registration
FROM accident_reports ar
WHERE ar.my_vehicle_registration ILIKE $1 
   OR ar.other_vehicle_registration ILIKE $1;

-- Query to get reports with failed image uploads
SELECT 
    ar.id,
    ar.created_at,
    ar.my_driver_name,
    ari.original_filename,
    ari.upload_error,
    ari.uploaded_at
FROM accident_reports ar
JOIN accident_report_images ari ON ar.id = ari.accident_report_id
WHERE ari.upload_status = 'failed'
ORDER BY ari.uploaded_at DESC;

-- Update query to mark image upload as successful
UPDATE accident_report_images 
SET 
    upload_status = 'uploaded',
    storage_bucket_url = $2,
    upload_error = NULL,
    is_processed = TRUE
WHERE id = $1;

-- Update query to mark image upload as failed
UPDATE accident_report_images 
SET 
    upload_status = 'failed',
    upload_error = $2
WHERE id = $1;

-- Query to get statistics
SELECT 
    COUNT(*) AS total_reports,
    COUNT(*) FILTER (WHERE submit_success = TRUE) AS successful_submissions,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS reports_last_30_days,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS reports_last_7_days,
    AVG((SELECT COUNT(*) FROM accident_report_images ari WHERE ari.accident_report_id = ar.id AND ari.upload_status = 'uploaded')) AS avg_images_per_report
FROM accident_reports ar;

-- Clean up old pending image uploads (older than 24 hours)
DELETE FROM accident_report_images 
WHERE upload_status = 'pending' 
  AND uploaded_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'; 