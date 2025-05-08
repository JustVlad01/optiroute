-- Add crate-related columns to the routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS crate_count INTEGER DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS full_crates INTEGER DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS remaining_items INTEGER DEFAULT 0;

-- Add additional columns that might be missing but are referenced in the view
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_number VARCHAR(50);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS vehicle_id INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- Add a trigger function to automatically calculate crate counts when orders are added or updated
CREATE OR REPLACE FUNCTION calculate_route_crates() RETURNS TRIGGER AS $$
DECLARE
    items_per_crate INTEGER := 25;
    route_id_val INTEGER;
BEGIN
    -- Determine which route ID to use based on the operation
    IF (TG_OP = 'DELETE') THEN
        route_id_val := OLD.route_id;
    ELSE
        route_id_val := NEW.route_id;
    END IF;
    
    -- Update the route with new totals when store orders change
    UPDATE routes
    SET 
        total_items = (
            SELECT COALESCE(SUM(total_items), 0)
            FROM store_orders
            WHERE route_id = route_id_val
        ),
        crate_count = CEILING((
            SELECT COALESCE(SUM(total_items), 0)
            FROM store_orders
            WHERE route_id = route_id_val
        )::numeric / items_per_crate),
        full_crates = FLOOR((
            SELECT COALESCE(SUM(total_items), 0)
            FROM store_orders
            WHERE route_id = route_id_val
        )::numeric / items_per_crate),
        remaining_items = (
            SELECT COALESCE(SUM(total_items), 0) % items_per_crate
            FROM store_orders
            WHERE route_id = route_id_val
        )
    WHERE id = route_id_val;
    
    RETURN NULL; -- for AFTER triggers, the return value is ignored
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on store_orders table
DROP TRIGGER IF EXISTS update_route_crates ON store_orders;
CREATE TRIGGER update_route_crates
AFTER INSERT OR UPDATE OR DELETE ON store_orders
FOR EACH ROW
EXECUTE FUNCTION calculate_route_crates();

-- Add a summary view for routes with crate information
CREATE OR REPLACE VIEW route_summary AS
SELECT 
    r.id,
    r.route_name,
    r.route_number,
    r.delivery_date,
    r.driver_name,
    r.status,
    r.total_items,
    r.crate_count,
    r.full_crates,
    r.remaining_items,
    oi.file_name as import_file,
    COUNT(so.id) as store_count
FROM 
    routes r
LEFT JOIN 
    order_imports oi ON r.import_id = oi.id
LEFT JOIN 
    store_orders so ON r.id = so.route_id
GROUP BY 
    r.id, r.route_name, r.route_number, r.delivery_date, 
    r.driver_name, r.status, r.total_items, r.crate_count, 
    r.full_crates, r.remaining_items, oi.file_name
ORDER BY 
    r.delivery_date DESC, r.route_name;

-- Update existing routes to calculate their crate information
UPDATE routes r
SET 
    total_items = subquery.total,
    crate_count = CEILING(subquery.total::numeric / 25),
    full_crates = FLOOR(subquery.total::numeric / 25),
    remaining_items = subquery.total % 25
FROM (
    SELECT 
        route_id, 
        COALESCE(SUM(total_items), 0) as total
    FROM 
        store_orders
    GROUP BY 
        route_id
) as subquery
WHERE r.id = subquery.route_id;

-- Example query to get route details with crate information
-- SELECT 
--     route_name, 
--     total_items, 
--     crate_count, 
--     full_crates, 
--     remaining_items, 
--     CASE 
--         WHEN remaining_items > 0 THEN 'Yes' 
--         ELSE 'No' 
--     END as has_partial_crate
-- FROM 
--     routes
-- ORDER BY 
--     total_items DESC; 