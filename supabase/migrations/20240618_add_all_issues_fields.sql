-- Add columns for site issues, customer complaints, and product complaints
ALTER TABLE driver_forms 
ADD COLUMN IF NOT EXISTS site_issues BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS site_issues_reason TEXT,
ADD COLUMN IF NOT EXISTS customer_complaints BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_complaints_reason TEXT,
ADD COLUMN IF NOT EXISTS product_complaints BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS product_complaints_reason TEXT; 