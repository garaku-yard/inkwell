-- Organizations are promoted to a first-class entity, distinct from personal
-- workspaces. A workspace is now a personal-only category-filter bundle; an
-- organization is a team that owns projects and bills its own seats. Existing
-- type='org' workspaces are migrated here verbatim (same UUIDs) so the client
-- can switch over without breaking any references.

-- ─── Organizations ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(255) NOT NULL UNIQUE,
    owner_id    UUID         NOT NULL,
    avatar_url  TEXT,
    description TEXT,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);

-- ─── Organization members ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL,
    role        VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    invited_by  UUID,
    joined_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);

-- ─── Organization invites ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_invites (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    role        VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    token       VARCHAR(255) NOT NULL UNIQUE,
    invited_by  UUID         NOT NULL,
    expires_at  TIMESTAMP    NOT NULL,
    accepted_at TIMESTAMP,
    declined_at TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_org_invites_token ON org_invites(token);
CREATE INDEX idx_org_invites_org_id ON org_invites(org_id);
CREATE INDEX idx_org_invites_email ON org_invites(email);

-- ─── Migrate existing type='org' workspaces → organizations ───────────────────
-- Reuse the workspace UUID as the org UUID so member rows (and any future
-- client references) line up one-to-one.

INSERT INTO organizations (id, name, slug, owner_id, avatar_url, description, created_at, updated_at)
SELECT id, name, slug, owner_id, avatar_url, description, created_at, updated_at
FROM workspaces
WHERE type = 'org'
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_members (id, org_id, user_id, role, invited_by, joined_at, created_at)
SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.invited_by, wm.joined_at, wm.created_at
FROM workspace_members wm
JOIN workspaces w ON w.id = wm.workspace_id
WHERE w.type = 'org'
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO org_invites (id, org_id, email, role, token, invited_by, expires_at, accepted_at, declined_at, created_at)
SELECT wi.id, wi.workspace_id, wi.email, wi.role, wi.token, wi.invited_by, wi.expires_at, wi.accepted_at, wi.declined_at, wi.created_at
FROM workspace_invites wi
JOIN workspaces w ON w.id = wi.workspace_id
WHERE w.type = 'org'
ON CONFLICT (token) DO NOTHING;
