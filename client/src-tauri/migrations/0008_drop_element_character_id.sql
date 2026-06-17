-- Drop the screenplay-only character_id column from script_elements. No editor
-- ever read or wrote it (all nine formats use element_type/content/formatting
-- only), so it was always NULL. character_id is not part of any index, so the
-- column drop is safe.
ALTER TABLE script_elements DROP COLUMN character_id;
