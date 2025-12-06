-- Add image_url column to beats table
-- This allows beats to have associated images

ALTER TABLE beats
ADD COLUMN image_url TEXT;

-- Add index for better query performance
CREATE INDEX idx_beats_image_url ON beats(image_url) WHERE image_url IS NOT NULL;

-- Add comment
COMMENT ON COLUMN beats.image_url IS 'URL or path to the image associated with this beat';
