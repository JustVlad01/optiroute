-- Create driver_performance_views table to track when drivers view their performance updates
CREATE TABLE IF NOT EXISTS driver_performance_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_performance_views_driver_id ON driver_performance_views(driver_id);
CREATE INDEX IF NOT EXISTS idx_performance_views_viewed_at ON driver_performance_views(viewed_at);

-- Enable Row Level Security
ALTER TABLE driver_performance_views ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Anyone can view performance views" 
ON driver_performance_views FOR SELECT USING (true);

CREATE POLICY "Anyone can insert performance views" 
ON driver_performance_views FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update performance views" 
ON driver_performance_views FOR UPDATE USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_performance_views_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_performance_views_updated_at_trigger
  BEFORE UPDATE ON driver_performance_views
  FOR EACH ROW
  EXECUTE FUNCTION update_performance_views_updated_at(); 