-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    is_starred BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP,
    CONSTRAINT chk_status CHECK (status IN ('draft', 'in_progress', 'completed', 'archived'))
);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);

-- Characters table
CREATE TABLE IF NOT EXISTS characters (
    character_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    role VARCHAR(100),
    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_characters_project_id ON characters(project_id);

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
    location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location_type VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_project_id ON locations(project_id);

-- Outline units table
CREATE TABLE IF NOT EXISTS outline_units (
    outline_unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    parent_id UUID REFERENCES outline_units(outline_unit_id) ON DELETE CASCADE,
    unit_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(50),
    tags JSONB DEFAULT '[]',
    icon VARCHAR(100),
    scene_id UUID,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outline_units_project_id ON outline_units(project_id);
CREATE INDEX idx_outline_units_parent_id ON outline_units(parent_id);

-- Scenes table
CREATE TABLE IF NOT EXISTS scenes (
    scene_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    outline_unit_id UUID REFERENCES outline_units(outline_unit_id) ON DELETE SET NULL,
    scene_heading VARCHAR(255) NOT NULL,
    content TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenes_project_id ON scenes(project_id);
CREATE INDEX idx_scenes_outline_unit_id ON scenes(outline_unit_id);

-- Script elements table
CREATE TABLE IF NOT EXISTS script_elements (
    element_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    scene_id UUID REFERENCES scenes(scene_id) ON DELETE SET NULL,
    element_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    character_id UUID REFERENCES characters(character_id) ON DELETE SET NULL,
    line_number INT NOT NULL DEFAULT 0,
    formatting JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_script_elements_project_id ON script_elements(project_id);
CREATE INDEX idx_script_elements_scene_id ON script_elements(scene_id);
CREATE INDEX idx_script_elements_line_number ON script_elements(line_number);
CREATE INDEX idx_script_elements_project_line ON script_elements(project_id, line_number);

-- Beats table
CREATE TABLE IF NOT EXISTS beats (
    beat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scene_numbers VARCHAR(255),
    start_page INT,
    end_page INT,
    color VARCHAR(50),
    position_x INT NOT NULL DEFAULT 0,
    position_y INT NOT NULL DEFAULT 0,
    width INT NOT NULL DEFAULT 200,
    height INT NOT NULL DEFAULT 100,
    image_url TEXT,
    act_number INT,
    beat_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_beats_project_id ON beats(project_id);
CREATE INDEX idx_beats_order ON beats(project_id, beat_order);

-- Beat connections table
CREATE TABLE IF NOT EXISTS beat_connections (
    connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    from_beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
    to_beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
    from_side VARCHAR(20) NOT NULL,
    to_side VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_beat_connections_project_id ON beat_connections(project_id);
CREATE INDEX idx_beat_connections_from_beat ON beat_connections(from_beat_id);
CREATE INDEX idx_beat_connections_to_beat ON beat_connections(to_beat_id);

-- Lanes table
CREATE TABLE IF NOT EXISTS lanes (
    lane_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50),
    lane_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lanes_project_id ON lanes(project_id);
CREATE INDEX idx_lanes_order ON lanes(project_id, lane_order);

-- Outline items table
CREATE TABLE IF NOT EXISTS outline_items (
    outline_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
    lane_id UUID NOT NULL REFERENCES lanes(lane_id) ON DELETE CASCADE,
    item_order INT NOT NULL DEFAULT 0,
    timeline_position DOUBLE PRECISION NOT NULL DEFAULT 0,
    width DOUBLE PRECISION NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outline_items_project_id ON outline_items(project_id);
CREATE INDEX idx_outline_items_beat_id ON outline_items(beat_id);
CREATE INDEX idx_outline_items_lane_id ON outline_items(lane_id);
