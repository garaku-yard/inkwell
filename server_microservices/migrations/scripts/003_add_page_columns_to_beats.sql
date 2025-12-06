-- Add start_page and end_page columns to beats table
-- This replaces the scene_numbers string field with proper integer columns

ALTER TABLE beats 
ADD COLUMN start_page INTEGER NOT NULL DEFAULT 1,
ADD COLUMN end_page INTEGER NOT NULL DEFAULT 1;

-- Migrate existing scene_numbers data to the new columns
-- Parse strings like "Pg. 1-10" or "Pg. 5"
UPDATE beats
SET 
    start_page = CASE
        WHEN scene_numbers ~ 'Pg\. *(\d+)-(\d+)' THEN 
            CAST(substring(scene_numbers from 'Pg\. *(\d+)') AS INTEGER)
        WHEN scene_numbers ~ 'Pg\. *(\d+)' THEN 
            CAST(substring(scene_numbers from 'Pg\. *(\d+)') AS INTEGER)
        ELSE 1
    END,
    end_page = CASE
        WHEN scene_numbers ~ 'Pg\. *(\d+)-(\d+)' THEN 
            CAST(substring(scene_numbers from '-(\d+)') AS INTEGER)
        WHEN scene_numbers ~ 'Pg\. *(\d+)' THEN 
            CAST(substring(scene_numbers from 'Pg\. *(\d+)') AS INTEGER)
        ELSE 1
    END
WHERE scene_numbers != '';

-- We'll keep scene_numbers for now for backwards compatibility
-- but mark it as deprecated by making it nullable
ALTER TABLE beats ALTER COLUMN scene_numbers DROP NOT NULL;
ALTER TABLE beats ALTER COLUMN scene_numbers SET DEFAULT NULL;

-- Add comment to indicate the column is deprecated
COMMENT ON COLUMN beats.scene_numbers IS 'DEPRECATED: Use start_page and end_page instead';
