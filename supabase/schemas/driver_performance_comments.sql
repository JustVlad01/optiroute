-- Create driver_performance_comments table to store comments for performance images
CREATE TABLE IF NOT EXISTS driver_performance_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL, -- Path to the performance image in storage
  image_name TEXT NOT NULL, -- Name of the image file
  comments TEXT, -- Comments about the performance
  created_by TEXT, -- Who created the comment (admin/supervisor name)
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_performance_comments_driver_id ON driver_performance_comments(driver_id);
CREATE INDEX IF NOT EXISTS idx_performance_comments_image_name ON driver_performance_comments(image_name);
CREATE INDEX IF NOT EXISTS idx_performance_comments_created_at ON driver_performance_comments(created_at);

-- Enable Row Level Security
ALTER TABLE driver_performance_comments ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Anyone can view performance comments" 
ON driver_performance_comments FOR SELECT USING (true);

CREATE POLICY "Anyone can insert performance comments" 
ON driver_performance_comments FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update performance comments" 
ON driver_performance_comments FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete performance comments" 
ON driver_performance_comments FOR DELETE USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_performance_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_performance_comments_updated_at_trigger
  BEFORE UPDATE ON driver_performance_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_performance_comments_updated_at();

-- Comments for documentation
COMMENT ON TABLE driver_performance_comments IS 'Stores comments for driver performance images';
COMMENT ON COLUMN driver_performance_comments.driver_id IS 'The driver this performance comment belongs to';
COMMENT ON COLUMN driver_performance_comments.image_path IS 'Full path to the image in storage (driver_id/filename)';
COMMENT ON COLUMN driver_performance_comments.image_name IS 'Name of the performance image file';
COMMENT ON COLUMN driver_performance_comments.comments IS 'Performance comments from supervisor/admin';
COMMENT ON COLUMN driver_performance_comments.created_by IS 'Name of the person who created the comment';
COMMENT ON COLUMN driver_performance_comments.updated_at IS 'Timestamp when the comment was last updated'; 