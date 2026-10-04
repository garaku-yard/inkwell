-- Preserve offline comment changes until the hosted collaboration service
-- confirms them. Existing local comments begin as pending creates.
ALTER TABLE local_comments ADD COLUMN author_id TEXT;
ALTER TABLE local_comments ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending_create';
ALTER TABLE local_comments ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE local_comments ADD COLUMN resolution_dirty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE local_comments ADD COLUMN line_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE local_comments ADD COLUMN parent_id TEXT;
ALTER TABLE sync_state ADD COLUMN comment_account_id TEXT;
CREATE INDEX idx_local_comments_sync ON local_comments(project_id, sync_status, created_at);
