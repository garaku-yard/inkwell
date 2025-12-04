-- Beat Board Tables Migration
-- This migration adds tables for the beat board feature

-- Beats table (story beats for visual planning)
CREATE TABLE beats (
    beat_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    scene_numbers VARCHAR(100) NOT NULL DEFAULT '',
    color VARCHAR(20) NOT NULL DEFAULT '#fef3c7',
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 200,
    height INTEGER NOT NULL DEFAULT 150,
    act_number INTEGER NOT NULL DEFAULT 1,
    beat_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Beat connections table (arrows between beats)
CREATE TABLE beat_connections (
    connection_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    from_beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
    to_beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
    from_side VARCHAR(10) NOT NULL CHECK (from_side IN ('top', 'right', 'bottom', 'left')),
    to_side VARCHAR(10) NOT NULL CHECK (to_side IN ('top', 'right', 'bottom', 'left')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(from_beat_id, to_beat_id)
);

-- Lanes table (timeline lanes for organizing beats)
CREATE TABLE lanes (
    lane_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#e5e7eb',
    lane_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Outline items table (beats placed on timeline lanes)
CREATE TABLE outline_items (
    outline_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
    lane_id UUID NOT NULL REFERENCES lanes(lane_id) ON DELETE CASCADE,
    item_order INTEGER NOT NULL DEFAULT 0,
    timeline_position DOUBLE PRECISION DEFAULT 0,
    width DOUBLE PRECISION DEFAULT 5,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_beats_project_id ON beats(project_id);
CREATE INDEX idx_beats_order ON beats(beat_order);
CREATE INDEX idx_beat_connections_project_id ON beat_connections(project_id);
CREATE INDEX idx_beat_connections_from_beat ON beat_connections(from_beat_id);
CREATE INDEX idx_beat_connections_to_beat ON beat_connections(to_beat_id);
CREATE INDEX idx_lanes_project_id ON lanes(project_id);
CREATE INDEX idx_lanes_order ON lanes(lane_order);
CREATE INDEX idx_outline_items_project_id ON outline_items(project_id);
CREATE INDEX idx_outline_items_beat_id ON outline_items(beat_id);
CREATE INDEX idx_outline_items_lane_id ON outline_items(lane_id);
CREATE INDEX idx_outline_items_order ON outline_items(item_order);
