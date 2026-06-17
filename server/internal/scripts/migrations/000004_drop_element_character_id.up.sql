-- Drop the screenplay-only character_id column from script_elements. The field
-- was never populated by any editor (all nine formats route through this table
-- with element_type/content/formatting only), so removing it has no data impact.
ALTER TABLE script_elements DROP COLUMN IF EXISTS character_id;
