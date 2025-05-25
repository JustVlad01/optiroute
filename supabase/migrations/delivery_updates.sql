-- Create delivery_updates table to store driver-store-route assignments
CREATE TABLE IF NOT EXISTS delivery_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  route_name TEXT,
  route_number TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS delivery_updates_driver_id_idx ON delivery_updates(driver_id);
CREATE INDEX IF NOT EXISTS delivery_updates_store_id_idx ON delivery_updates(store_id);

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_delivery_updates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delivery_updates_updated_at
BEFORE UPDATE ON delivery_updates
FOR EACH ROW
EXECUTE FUNCTION update_delivery_updates_updated_at(); 