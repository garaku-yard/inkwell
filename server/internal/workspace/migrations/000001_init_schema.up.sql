CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Categories (seed data) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    icon        VARCHAR(50),
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Seed built-in categories
INSERT INTO categories (slug, name, description, icon) VALUES
    ('screenplay',          'Screenplay',          'Feature films, shorts, and TV pilots',                      'film'),
    ('novel',               'Novel',               'Full-length fiction and non-fiction books',                 'book-open'),
    ('comic_script',        'Comic Script',        'Comic books and graphic novels',                            'image'),
    ('poetry',              'Poetry',              'Poems, collections, and song lyrics',                       'feather'),
    ('interactive_fiction', 'Interactive Fiction', 'Branching narratives and game stories',                     'git-branch'),
    ('tabletop_rpg',        'Tabletop RPG',        'Campaign modules, adventures, and sourcebooks',             'dice'),
    ('memoir',              'Memoir',              'Autobiography, personal essays, and narrative non-fiction',  'user'),
    ('lyrics',              'Lyrics',              'Song lyrics with verse/chorus structure',                   'music')
ON CONFLICT (slug) DO NOTHING;

-- ─── Workspaces ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspaces (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(255) NOT NULL UNIQUE,
    type        VARCHAR(20)  NOT NULL CHECK (type IN ('personal', 'org')),
    owner_id    UUID         NOT NULL,
    avatar_url  TEXT,
    description TEXT,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_owner_id ON workspaces(owner_id);
CREATE INDEX idx_workspaces_type ON workspaces(type);

-- ─── Workspace ↔ Category join ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_categories (
    id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    category_id   UUID      NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, category_id)
);

CREATE INDEX idx_workspace_categories_workspace_id ON workspace_categories(workspace_id);

-- ─── Workspace members (org workspaces only) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_members (
    id            UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       UUID       NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    invited_by    UUID,
    joined_at     TIMESTAMP  NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMP  NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);

-- ─── Workspace invites ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_invites (
    id            UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email         VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    token         VARCHAR(255) NOT NULL UNIQUE,
    invited_by    UUID        NOT NULL,
    expires_at    TIMESTAMP   NOT NULL,
    accepted_at   TIMESTAMP,
    declined_at   TIMESTAMP,
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_invites_token ON workspace_invites(token);
CREATE INDEX idx_workspace_invites_workspace_id ON workspace_invites(workspace_id);
CREATE INDEX idx_workspace_invites_email ON workspace_invites(email);
