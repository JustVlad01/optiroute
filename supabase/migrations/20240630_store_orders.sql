-- Create order_imports table
CREATE TABLE IF NOT EXISTS public.order_imports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    route TEXT NOT NULL,
    delivery_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create store_orders table
CREATE TABLE IF NOT EXISTS public.store_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_code TEXT NOT NULL,
    store_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    route TEXT NOT NULL,
    delivery_date DATE NOT NULL,
    import_id UUID NOT NULL REFERENCES public.order_imports(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_store_orders_route ON public.store_orders(route);
CREATE INDEX IF NOT EXISTS idx_store_orders_delivery_date ON public.store_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_store_orders_import_id ON public.store_orders(import_id);

-- Create RLS policies
ALTER TABLE public.order_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read orders
CREATE POLICY order_imports_select_policy ON public.order_imports 
    FOR SELECT USING (true);

CREATE POLICY store_orders_select_policy ON public.store_orders 
    FOR SELECT USING (true);

-- Allow authenticated users to insert orders
CREATE POLICY order_imports_insert_policy ON public.order_imports 
    FOR INSERT WITH CHECK (true);

CREATE POLICY store_orders_insert_policy ON public.store_orders 
    FOR INSERT WITH CHECK (true);

-- Add trigger to update updated_at on change
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_imports_updated_at
BEFORE UPDATE ON public.order_imports
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_store_orders_updated_at
BEFORE UPDATE ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION update_modified_column(); 