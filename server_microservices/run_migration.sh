#!/bin/bash

# Migration script to add user_tag column
echo "Adding user_tag column to users table..."

PGPASSWORD=root psql -h localhost -p 5432 -U postgres -d identity_db << 'EOF'
-- Add user_tag column
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_tag VARCHAR(5) NOT NULL DEFAULT '00000';

-- Create function to generate unique tags
CREATE OR REPLACE FUNCTION generate_user_tag() RETURNS VARCHAR(5) AS $$
DECLARE
    tag VARCHAR(5);
    exists_count INTEGER;
BEGIN
    LOOP
        -- Generate a random 5-digit number (10000-99999)
        tag := LPAD((RANDOM() * 90000 + 10000)::INTEGER::TEXT, 5, '0');
        
        -- Check if this tag already exists
        SELECT COUNT(*) INTO exists_count 
        FROM users 
        WHERE user_tag = tag;
        
        -- If tag is unique, exit loop
        IF exists_count = 0 THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN tag;
END;
$$ LANGUAGE plpgsql;

-- Update existing users with unique random tags
UPDATE users 
SET user_tag = generate_user_tag() 
WHERE user_tag = '00000';

-- Remove the default constraint
ALTER TABLE users ALTER COLUMN user_tag DROP DEFAULT;

-- Add unique constraint on username + user_tag combination
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_username_tag_unique UNIQUE (username, user_tag);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_users_username_tag ON users(username, user_tag);

-- Drop the function
DROP FUNCTION IF EXISTS generate_user_tag();

-- Show updated table structure
\d users;

SELECT 'Migration completed successfully!' as status;
EOF

echo "Migration script completed!"