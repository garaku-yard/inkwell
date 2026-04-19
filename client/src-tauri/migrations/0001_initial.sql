-- Initial schema for the Inkwell desktop build. Mirrors the scripts-service
-- Postgres tables closely enough that a future cloud-sync migration can map
-- rows one-to-one. UUIDs are generated client-side (`crypto.randomUUID()`)
-- and stored as TEXT. Timestamps are ISO 8601 strings. JSON columns
-- (formatting, attributes) are stored as TEXT and serialised at the JS layer.

CREATE TABLE IF NOT EXISTS user_profile (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  username   TEXT NOT NULL,
  user_tag   TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name  TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'personal',
  owner_id        TEXT NOT NULL,
  avatar_url      TEXT,
  description     TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  owner_id     TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'screenplay',
  status       TEXT NOT NULL DEFAULT 'draft',
  is_starred   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);

CREATE TABLE IF NOT EXISTS scenes (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  outline_unit_id TEXT,
  scene_heading   TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  order_index     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id, order_index);

CREATE TABLE IF NOT EXISTS script_elements (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id        TEXT REFERENCES scenes(id) ON DELETE CASCADE,
  element_type    TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  character_id    TEXT,
  line_number     INTEGER NOT NULL DEFAULT 0,
  formatting_json TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_elements_scene ON script_elements(scene_id, line_number);
CREATE INDEX IF NOT EXISTS idx_elements_project ON script_elements(project_id, line_number);

CREATE TABLE IF NOT EXISTS characters (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT '',
  attributes_json TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);

CREATE TABLE IF NOT EXISTS locations (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_project ON locations(project_id);

-- Beat board -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS beats (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  scene_numbers TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#FFFFFF',
  position_x    REAL NOT NULL DEFAULT 0,
  position_y    REAL NOT NULL DEFAULT 0,
  width         REAL NOT NULL DEFAULT 200,
  height        REAL NOT NULL DEFAULT 100,
  act           INTEGER NOT NULL DEFAULT 1,
  order_index   INTEGER NOT NULL DEFAULT 0,
  start_page    INTEGER,
  end_page      INTEGER,
  image_url     TEXT
);

CREATE INDEX IF NOT EXISTS idx_beats_project ON beats(project_id, act, order_index);

CREATE TABLE IF NOT EXISTS connections (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  from_side  TEXT NOT NULL,
  to_side    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connections_project ON connections(project_id);

CREATE TABLE IF NOT EXISTS lanes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#CCCCCC',
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lanes_project ON lanes(project_id, order_index);

CREATE TABLE IF NOT EXISTS outline_items (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  beat_id           TEXT NOT NULL,
  lane_id           TEXT NOT NULL,
  order_index       INTEGER NOT NULL DEFAULT 0,
  timeline_position REAL,
  width             REAL
);

CREATE INDEX IF NOT EXISTS idx_outline_items_project ON outline_items(project_id, lane_id, order_index);
