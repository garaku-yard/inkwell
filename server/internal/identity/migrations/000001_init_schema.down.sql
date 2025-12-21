-- Drop tables in reverse order
DROP TABLE IF EXISTS login_history;
DROP TABLE IF EXISTS email_verification_tokens;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;

-- Drop extension
DROP EXTENSION IF EXISTS "uuid-ossp";
