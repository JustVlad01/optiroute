-- Example 1: Match stores for the most recent import
WITH recent_import AS (
    SELECT id FROM order_imports ORDER BY imported_at DESC LIMIT 1
)
SELECT * FROM match_orders_with_store_masterfile((SELECT id FROM recent_import));

-- Example 2: Match stores for a specific import ID (replace 123 with actual import ID)
SELECT * FROM match_orders_with_store_masterfile(123);

-- Example 3: Match stores with a custom similarity threshold (0.25 instead of default 0.1)
SELECT * FROM match_orders_with_store_masterfile(123, 0.25);

-- Example 4: Retrieve the resulting matched store information after matching
WITH recent_import AS (
    SELECT id FROM order_imports ORDER BY imported_at DESC LIMIT 1
)
SELECT * FROM get_matched_store_information((SELECT id FROM recent_import));

-- Example 5: Get a count of matches by route
WITH recent_import AS (
    SELECT id FROM order_imports ORDER BY imported_at DESC LIMIT 1
)
SELECT 
    r.route_name,
    COUNT(*) AS total_stores,
    COUNT(CASE WHEN msi.store_information_id IS NOT NULL THEN 1 END) AS matched_stores,
    ROUND(AVG(msi.match_quality) * 100, 2) AS avg_match_quality_percent
FROM 
    routes r
LEFT JOIN
    matched_store_information msi ON r.id = msi.route_id
WHERE 
    r.import_id = (SELECT id FROM recent_import)
GROUP BY
    r.route_name
ORDER BY
    r.route_name;

-- Example 6: Find unmatched stores that need manual review
WITH recent_import AS (
    SELECT id FROM order_imports ORDER BY imported_at DESC LIMIT 1
)
SELECT 
    r.route_name,
    so.customer_name,
    so.customer_code,
    so.total_items
FROM 
    store_orders so
JOIN
    routes r ON so.route_id = r.id
LEFT JOIN
    matched_store_information msi ON so.id = msi.store_order_id
WHERE 
    r.import_id = (SELECT id FROM recent_import) AND
    msi.id IS NULL
ORDER BY
    r.route_name,
    so.customer_name; 