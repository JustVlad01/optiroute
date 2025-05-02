-- Add columns for orders and products issues
ALTER TABLE driver_forms 
ADD COLUMN IF NOT EXISTS orders_products_issues BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS orders_products_issues_reason TEXT; 