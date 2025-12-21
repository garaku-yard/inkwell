-- Drop tables in reverse order
DROP TABLE IF EXISTS edit_sessions;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS collaborators;

-- Drop extension
DROP EXTENSION IF EXISTS "uuid-ossp";
