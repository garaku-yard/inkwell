-- Ready edit_sessions to back durable advisory edit locks.
--
-- 1. element_id — which element a user is currently focused on within a session
--    (nullable: a session with no current focus, e.g. just joined or idle,
--    leaves it NULL).
--
-- 2. timestamptz — the 000001 timestamp columns are `timestamp` (without time
--    zone). Combined with NOW() writes across a connection pool whose sessions
--    can sit in different time zones (the gateway host is not necessarily UTC),
--    staleness comparisons could be off by the host's UTC offset and hide fresh
--    sessions. timestamptz stores absolute instants, so NOW()-based comparisons
--    are timezone-independent regardless of any connection's session TimeZone.
--    Existing naive values are interpreted as UTC (the DB server default).

ALTER TABLE edit_sessions ADD COLUMN IF NOT EXISTS element_id UUID;

ALTER TABLE edit_sessions
    ALTER COLUMN started_at TYPE timestamptz USING started_at AT TIME ZONE 'UTC',
    ALTER COLUMN last_activity_at TYPE timestamptz USING last_activity_at AT TIME ZONE 'UTC',
    ALTER COLUMN ended_at TYPE timestamptz USING ended_at AT TIME ZONE 'UTC';

-- Reads list active, non-stale sessions per project ordered by recency; this
-- index backs that lookup (the partial "active" index on (project_id, user_id)
-- from 000001 already covers the get-or-create-by-project-user path).
CREATE INDEX IF NOT EXISTS idx_edit_sessions_project_activity
    ON edit_sessions (project_id, last_activity_at DESC)
    WHERE ended_at IS NULL;
