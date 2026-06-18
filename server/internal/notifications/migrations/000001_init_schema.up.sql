CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Notification preferences ─────────────────────────────────────────────────
-- One row per user. Absent rows are treated as the all-on defaults (except
-- marketing) by the service, so a row is only written once a user saves.

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id                  UUID        PRIMARY KEY,
    email_comments           BOOLEAN     NOT NULL DEFAULT true,
    email_mentions           BOOLEAN     NOT NULL DEFAULT true,
    email_project_updates    BOOLEAN     NOT NULL DEFAULT true,
    email_collaborator_joins BOOLEAN     NOT NULL DEFAULT true,
    in_app_notifications     BOOLEAN     NOT NULL DEFAULT true,
    marketing_emails         BOOLEAN     NOT NULL DEFAULT false,
    product_updates          BOOLEAN     NOT NULL DEFAULT true,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
