-- Create a new table for crate tracking
CREATE TABLE IF NOT EXISTS crate_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    driver_id UUID REFERENCES drivers(id),
    vehicle_id TEXT,
    cratesOut INTEGER NOT NULL DEFAULT 0,
    cratesIn INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create an index on date for faster queries
CREATE INDEX IF NOT EXISTS idx_crate_tracking_date ON crate_tracking(date);

-- Add RLS policies
ALTER TABLE crate_tracking ENABLE ROW LEVEL SECURITY;

-- Everyone can view crate tracking data
CREATE POLICY "Allow all users to view crate tracking" ON crate_tracking
    FOR SELECT USING (true);

-- Only authenticated users can insert/update crate tracking data
CREATE POLICY "Allow authenticated users to insert crate data" ON crate_tracking
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update crate data" ON crate_tracking
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update the timestamp
CREATE TRIGGER update_crate_tracking_timestamp
BEFORE UPDATE ON crate_tracking
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Sample data (optional - comment out if not needed)
INSERT INTO crate_tracking (date, cratesOut, cratesIn, notes)
VALUES 
    (CURRENT_DATE - INTERVAL '6 days', 120, 110, 'Monday delivery'),
    (CURRENT_DATE - INTERVAL '5 days', 130, 125, 'Tuesday delivery'),
    (CURRENT_DATE - INTERVAL '4 days', 140, 135, 'Wednesday delivery'),
    (CURRENT_DATE - INTERVAL '3 days', 135, 130, 'Thursday delivery'),
    (CURRENT_DATE - INTERVAL '2 days', 150, 145, 'Friday delivery'),
    (CURRENT_DATE - INTERVAL '1 day', 100, 95, 'Saturday delivery'),
    (CURRENT_DATE, 80, 75, 'Sunday delivery'); 