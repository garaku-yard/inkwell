DROP INDEX IF EXISTS idx_edit_sessions_project_activity;

ALTER TABLE edit_sessions
    ALTER COLUMN started_at TYPE timestamp USING started_at AT TIME ZONE 'UTC',
    ALTER COLUMN last_activity_at TYPE timestamp USING last_activity_at AT TIME ZONE 'UTC',
    ALTER COLUMN ended_at TYPE timestamp USING ended_at AT TIME ZONE 'UTC';

ALTER TABLE edit_sessions DROP COLUMN IF EXISTS element_id;
