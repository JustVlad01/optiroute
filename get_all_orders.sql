-- Function to get all orders with their routes and store information
CREATE OR REPLACE FUNCTION get_all_orders()
RETURNS TABLE(
    import_id INT,
    file_name TEXT,
    import_date TIMESTAMP,
    order_delivery_date DATE,
    order_status TEXT,
    route_id INT,
    route_name TEXT,
    route_number TEXT,
    driver_name TEXT,
    route_delivery_date DATE,
    route_status TEXT,
    store_id INT,
    customer_name TEXT,
    customer_code TEXT,
    total_items INT,
    store_status TEXT
)
LANGUAGE SQL
AS $$
    SELECT 
        oi.id AS import_id,
        oi.file_name,
        oi.imported_at AS import_date,
        oi.delivery_date AS order_delivery_date,
        oi.status AS order_status,
        r.id AS route_id,
        r.route_name,
        r.route_number,
        r.driver_name,
        r.delivery_date AS route_delivery_date,
        r.status AS route_status,
        so.id AS store_id,
        so.customer_name,
        so.customer_code,
        so.total_items,
        so.order_status AS store_status
    FROM 
        order_imports oi
    LEFT JOIN 
        routes r ON oi.id = r.import_id
    LEFT JOIN 
        store_orders so ON r.id = so.route_id
    ORDER BY 
        oi.imported_at DESC, r.id, so.id;
$$;