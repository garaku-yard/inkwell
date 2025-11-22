-- Add deleted_at column to scenes table for soft deletes
ALTER TABLE scenes ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

-- Create index for performance on deleted_at queries
CREATE INDEX idx_scenes_deleted_at ON scenes(deleted_at);

-- Update existing GetScene and related queries to support soft deletes
-- Note: The repository code should be updated to use "WHERE deleted_at IS NULL"
-- for filtering out soft-deleted records.