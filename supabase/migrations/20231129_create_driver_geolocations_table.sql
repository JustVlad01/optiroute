-- Create the driver_geolocations table
CREATE TABLE IF NOT EXISTS public.driver_geolocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id),
    dispatch_code TEXT,
    store_name TEXT,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment to the table
COMMENT ON TABLE public.driver_geolocations IS 'Stores geolocation data collected by drivers for dispatch codes or stores';

-- Create index on driver_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_driver_geolocations_driver_id ON public.driver_geolocations(driver_id);

-- Create index on dispatch_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_driver_geolocations_dispatch_code ON public.driver_geolocations(dispatch_code);

-- Create index on store_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_driver_geolocations_store_name ON public.driver_geolocations(store_name);

-- Make table accessible to all (no authentication required)
ALTER TABLE public.driver_geolocations ENABLE ROW LEVEL SECURITY;

-- Allow public access for all operations
CREATE POLICY "Allow public access to geolocations" 
ON public.driver_geolocations
FOR ALL 
TO public
USING (true);

-- Grant all permissions to public role
GRANT ALL ON public.driver_geolocations TO public; 