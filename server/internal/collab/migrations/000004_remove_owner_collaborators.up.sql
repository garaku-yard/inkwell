-- Project ownership belongs exclusively to scripts.projects.owner_id. Remove
-- the old best-effort collab projection and prevent it from being recreated.
DELETE FROM collaborators WHERE role = 'owner';

ALTER TABLE collaborators DROP CONSTRAINT IF EXISTS chk_role;
ALTER TABLE collaborators
    ADD CONSTRAINT chk_role CHECK (role IN ('editor', 'viewer', 'commenter'));
