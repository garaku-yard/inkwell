ALTER TABLE collaborators DROP CONSTRAINT IF EXISTS chk_role;
ALTER TABLE collaborators
    ADD CONSTRAINT chk_role CHECK (role IN ('owner', 'editor', 'viewer', 'commenter'));
