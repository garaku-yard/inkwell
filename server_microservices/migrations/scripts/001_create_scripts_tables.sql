-- Scripts Service Database Schema
-- This schema handles projects, screenplays, scenes, characters, locations, and outline units

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects metadata table
CREATE TABLE projects_meta (
    project_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL, -- References users.user_id from Identity service
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    genre VARCHAR(100),
    logline TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Screenplays table
CREATE TABLE screenplays (
    screenplay_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT, -- Full screenplay content
    version INTEGER DEFAULT 1,
    is_current BOOLEAN DEFAULT true,
    format_type VARCHAR(50) DEFAULT 'feature' CHECK (format_type IN ('feature', 'tv', 'stage', 'short')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Characters table
CREATE TABLE characters (
    character_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    role VARCHAR(100), -- "protagonist", "antagonist", "supporting", etc.
    attributes JSONB, -- Key-value pairs for character traits
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Locations table
CREATE TABLE locations (
    location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) CHECK (type IN ('interior', 'exterior')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Unified outline units table (acts, sequences, beats, sub-beats)
CREATE TABLE outline_units (
    outline_unit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    parent_id UUID REFERENCES outline_units(outline_unit_id) ON DELETE CASCADE,
    
    -- Type of unit: 'act', 'sequence', 'beat', 'sub-beat'
    type VARCHAR(20) NOT NULL CHECK (type IN ('act', 'sequence', 'beat', 'sub-beat')),
    
    -- Basic information
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Optional attributes for planning / editor display
    color VARCHAR(20),         -- e.g., for outline editor color coding
    tags JSONB,                -- array of strings
    icon VARCHAR(50),          -- optional icon name
    
    -- Ordering for drag-and-drop in editor
    order_index INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Scenes table
CREATE TABLE scenes (
    scene_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects_meta(project_id) ON DELETE CASCADE,
    outline_unit_id UUID REFERENCES outline_units(outline_unit_id), -- optional link to outline unit
    scene_heading VARCHAR(500) NOT NULL, -- INT./EXT. LOCATION - TIME
    content TEXT, -- Scene content/action
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Script elements table (individual lines/elements of a screenplay)
CREATE TABLE script_elements (
    script_element_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    screenplay_id UUID NOT NULL REFERENCES screenplays(screenplay_id) ON DELETE CASCADE,
    scene_id UUID REFERENCES scenes(scene_id), -- optional link to scene
    type VARCHAR(50) NOT NULL CHECK (type IN ('scene_heading', 'character', 'dialogue', 'action', 'parenthetical', 'transition', 'shot')),
    content TEXT NOT NULL, -- The actual text content
    character_id UUID REFERENCES characters(character_id), -- For dialogue elements
    line_number INTEGER NOT NULL, -- Position in screenplay
    formatting JSONB, -- Additional formatting attributes (font, style, etc.)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Scene characters (many-to-many relationship)
CREATE TABLE scene_characters (
    scene_id UUID NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
    PRIMARY KEY (scene_id, character_id)
);

-- Scene locations (many-to-many relationship)
CREATE TABLE scene_locations (
    scene_id UUID NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
    PRIMARY KEY (scene_id, location_id)
);

-- Screenplay versions history
CREATE TABLE screenplay_versions (
    version_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    screenplay_id UUID NOT NULL REFERENCES screenplays(screenplay_id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    change_summary TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_projects_meta_owner_id ON projects_meta(owner_id);
CREATE INDEX idx_projects_meta_status ON projects_meta(status);
CREATE INDEX idx_screenplays_project_id ON screenplays(project_id);
CREATE INDEX idx_screenplays_current ON screenplays(is_current);
CREATE INDEX idx_characters_project_id ON characters(project_id);
CREATE INDEX idx_locations_project_id ON locations(project_id);
CREATE INDEX idx_outline_units_project_id ON outline_units(project_id);
CREATE INDEX idx_outline_units_parent_id ON outline_units(parent_id);
CREATE INDEX idx_outline_units_type ON outline_units(type);
CREATE INDEX idx_outline_units_order ON outline_units(order_index);
CREATE INDEX idx_scenes_project_id ON scenes(project_id);
CREATE INDEX idx_scenes_outline_unit_id ON scenes(outline_unit_id);
CREATE INDEX idx_scenes_order ON scenes(order_index);
CREATE INDEX idx_screenplay_versions_screenplay_id ON screenplay_versions(screenplay_id);
CREATE INDEX idx_script_elements_screenplay_id ON script_elements(screenplay_id);
CREATE INDEX idx_script_elements_scene_id ON script_elements(scene_id);
CREATE INDEX idx_script_elements_line_number ON script_elements(line_number);
CREATE INDEX idx_script_elements_type ON script_elements(type);
CREATE INDEX idx_script_elements_character_id ON script_elements(character_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_projects_meta_updated_at BEFORE UPDATE ON projects_meta
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_screenplays_updated_at BEFORE UPDATE ON screenplays
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON characters
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_outline_units_updated_at BEFORE UPDATE ON outline_units
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON scenes
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_script_elements_updated_at BEFORE UPDATE ON script_elements
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function to create new screenplay version on content change
CREATE OR REPLACE FUNCTION create_screenplay_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create version if content actually changed
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        INSERT INTO screenplay_versions (screenplay_id, version_number, content, change_summary)
        VALUES (NEW.screenplay_id, NEW.version, NEW.content, 'Auto-saved version');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically create screenplay versions
CREATE TRIGGER create_screenplay_version_trigger AFTER UPDATE ON screenplays
    FOR EACH ROW EXECUTE PROCEDURE create_screenplay_version();

-- Function to update line numbers when script elements are inserted/deleted
CREATE OR REPLACE FUNCTION update_line_numbers()
RETURNS TRIGGER AS $$
BEGIN
    -- When inserting, shift subsequent lines down
    IF TG_OP = 'INSERT' THEN
        UPDATE script_elements 
        SET line_number = line_number + 1
        WHERE screenplay_id = NEW.screenplay_id 
          AND line_number >= NEW.line_number 
          AND script_element_id != NEW.script_element_id;
        RETURN NEW;
    END IF;
    
    -- When deleting, shift subsequent lines up
    IF TG_OP = 'DELETE' THEN
        UPDATE script_elements 
        SET line_number = line_number - 1
        WHERE screenplay_id = OLD.screenplay_id 
          AND line_number > OLD.line_number;
        RETURN OLD;
    END IF;
    
    -- When updating line number, handle the reordering
    IF TG_OP = 'UPDATE' AND OLD.line_number != NEW.line_number THEN
        -- Moving line down (increasing line number)
        IF NEW.line_number > OLD.line_number THEN
            UPDATE script_elements 
            SET line_number = line_number - 1
            WHERE screenplay_id = NEW.screenplay_id 
              AND line_number > OLD.line_number 
              AND line_number <= NEW.line_number
              AND script_element_id != NEW.script_element_id;
        -- Moving line up (decreasing line number)
        ELSE
            UPDATE script_elements 
            SET line_number = line_number + 1
            WHERE screenplay_id = NEW.screenplay_id 
              AND line_number >= NEW.line_number 
              AND line_number < OLD.line_number
              AND script_element_id != NEW.script_element_id;
        END IF;
        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for line number management (commented out for now - can be enabled if automatic line management is desired)
-- CREATE TRIGGER manage_line_numbers_insert AFTER INSERT ON script_elements
--     FOR EACH ROW EXECUTE PROCEDURE update_line_numbers();
-- 
-- CREATE TRIGGER manage_line_numbers_update AFTER UPDATE ON script_elements
--     FOR EACH ROW EXECUTE PROCEDURE update_line_numbers();
-- 
-- CREATE TRIGGER manage_line_numbers_delete AFTER DELETE ON script_elements
--     FOR EACH ROW EXECUTE PROCEDURE update_line_numbers();