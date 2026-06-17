-- Revert to globally-unique usernames. This can fail if duplicate usernames
-- were created while Model B was active — that's expected; the down migration
-- is only safe before any username collision exists.
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_username_tag;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
