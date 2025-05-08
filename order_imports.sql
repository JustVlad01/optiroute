-- Create a table to store order imports
CREATE TABLE order_imports (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported_by VARCHAR(255), -- Can link to user ID if authentication is implemented
    order_data JSONB NOT NULL -- Store the full parsed order data as JSONB
);

-- Create a table for routes extracted from imports
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    import_id INTEGER REFERENCES order_imports(id) ON DELETE CASCADE,
    route_name VARCHAR(255) NOT NULL,
    delivery_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create a table for store orders within routes
CREATE TABLE store_orders (
    id SERIAL PRIMARY KEY,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    total_items INTEGER NOT NULL,
    order_status VARCHAR(50) DEFAULT 'pending' CHECK (order_status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX idx_order_imports_imported_at ON order_imports(imported_at);
CREATE INDEX idx_routes_import_id ON routes(import_id);
CREATE INDEX idx_store_orders_route_id ON store_orders(route_id);

-- Example query to insert a new order import
-- INSERT INTO order_imports (file_name, imported_by, order_data) 
-- VALUES ('example.xlsx', 'admin', '{"fileName": "example.xlsx", "routes": [...]}');

-- Example query to retrieve all routes for a specific import
-- SELECT r.* FROM routes r WHERE r.import_id = 1;

-- Example query to retrieve all store orders for a specific route
-- SELECT s.* FROM store_orders s WHERE s.route_id = 1;

-- Example query to retrieve full import data with routes and store orders
-- SELECT 
--     oi.id as import_id, 
--     oi.file_name, 
--     oi.imported_at,
--     r.id as route_id, 
--     r.route_name,
--     r.delivery_date,
--     s.id as store_order_id,
--     s.customer_name,
--     s.total_items,
--     s.order_status
-- FROM 
--     order_imports oi
-- JOIN 
--     routes r ON oi.id = r.import_id
-- JOIN 
--     store_orders s ON r.id = s.route_id
-- WHERE 
--     oi.id = 1
-- ORDER BY 
--     r.route_name, s.customer_name; 