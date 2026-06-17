-- Model B (Discord-style identity): usernames are no longer globally unique;
-- the (username, user_tag) pair is what must be unique, so that "username#tag"
-- resolves to exactly one user. Drop the single-column unique on username and
-- enforce uniqueness on the combination instead.
--
-- Existing rows can't violate the new constraint: username was unique until
-- now, so every (username, user_tag) pair is already distinct. The plain
-- idx_users_username index stays for username lookups.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ADD CONSTRAINT uq_users_username_tag UNIQUE (username, user_tag);
