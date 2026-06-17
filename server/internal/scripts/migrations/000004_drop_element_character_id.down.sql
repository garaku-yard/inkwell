-- Restore the character_id column (nullable FK to characters), matching the
-- original 000001 schema. Existing rows get NULL, which is what the column
-- always held in practice.
ALTER TABLE script_elements ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES characters(character_id) ON DELETE SET NULL;
