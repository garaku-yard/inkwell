-- Update existing users with random user_tag values
-- This script assigns unique 5-digit tags to users who don't have them

-- First, let's see current state
SELECT user_id, username, user_tag FROM users WHERE user_tag IS NULL OR user_tag = '' OR user_tag = '00000';

-- Create a function to generate unique user tags
CREATE OR REPLACE FUNCTION generate_unique_user_tag() RETURNS VARCHAR(5) AS $$
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

-- Update users without tags (could be NULL, empty, or default '00000')
UPDATE users 
SET user_tag = generate_unique_user_tag() 
WHERE user_tag IS NULL OR user_tag = '' OR user_tag = '00000';

-- Add constraints if they don't exist
DO $$
BEGIN
    -- Add unique constraint on username + user_tag combination if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_username_tag_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_username_tag_unique UNIQUE (username, user_tag);
    END IF;
END$$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_username_tag ON users(username, user_tag);

-- Clean up the function
DROP FUNCTION generate_unique_user_tag();

-- Show updated users
SELECT user_id, username, user_tag FROM users;

SELECT 'User tag migration completed!' as status;