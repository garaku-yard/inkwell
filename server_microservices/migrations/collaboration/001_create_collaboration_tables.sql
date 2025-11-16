-- Collaboration Service Database Schema
-- This schema handles collaborators, comments, real-time editing, and user presence

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Collaborators table
CREATE TABLE collaborators (
    collaborator_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL, -- References projects_meta.project_id from Scripts service
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
    invited_by UUID NOT NULL, -- References users.user_id from Identity service
    invited_at TIMESTAMP DEFAULT NOW(),
    joined_at TIMESTAMP,
    last_active TIMESTAMP,
    UNIQUE(project_id, user_id)
);

-- Comments table
CREATE TABLE comments (
    comment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL, -- References projects_meta.project_id from Scripts service
    screenplay_id UUID, -- References screenplays.screenplay_id from Scripts service
    script_element_id UUID, -- References script_elements.script_element_id from Scripts service
    scene_id UUID, -- References scenes.scene_id from Scripts service
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    content TEXT NOT NULL,
    line_number INTEGER, -- Line in screenplay where comment is attached
    char_position INTEGER, -- Character position in line
    parent_id UUID REFERENCES comments(comment_id) ON DELETE CASCADE, -- For reply threads
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Real-time editing sessions
CREATE TABLE edit_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL, -- References projects_meta.project_id from Scripts service
    screenplay_id UUID NOT NULL, -- References screenplays.screenplay_id from Scripts service
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    started_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Live editing operations log
CREATE TABLE edit_operations (
    operation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('insert', 'delete', 'replace')),
    position INTEGER NOT NULL, -- Position in document
    content TEXT, -- Content being inserted/replaced
    length INTEGER, -- Length of content being deleted
    timestamp TIMESTAMP DEFAULT NOW()
);

-- User presence tracking
CREATE TABLE user_presence (
    presence_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    project_id UUID NOT NULL, -- References projects_meta.project_id from Scripts service
    screenplay_id UUID, -- References screenplays.screenplay_id from Scripts service
    cursor_position INTEGER DEFAULT 0,
    selection_start INTEGER,
    selection_end INTEGER,
    last_seen TIMESTAMP DEFAULT NOW(),
    is_online BOOLEAN DEFAULT true,
    UNIQUE(user_id, project_id, screenplay_id)
);

-- Comment mentions (for @username functionality)
CREATE TABLE comment_mentions (
    mention_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(comment_id) ON DELETE CASCADE,
    mentioned_user_id UUID NOT NULL, -- References users.user_id from Identity service
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Collaboration invitations
CREATE TABLE collaboration_invitations (
    invitation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL, -- References projects_meta.project_id from Scripts service
    inviter_id UUID NOT NULL, -- References users.user_id from Identity service
    email VARCHAR(255) NOT NULL, -- Email of person being invited
    role VARCHAR(50) NOT NULL CHECK (role IN ('editor', 'viewer')),
    token VARCHAR(255) NOT NULL UNIQUE, -- Invitation token
    expires_at TIMESTAMP NOT NULL,
    accepted BOOLEAN DEFAULT false,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Project activity log
CREATE TABLE project_activity (
    activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL, -- References projects_meta.project_id from Scripts service
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    activity_type VARCHAR(100) NOT NULL, -- 'comment_added', 'screenplay_updated', 'collaborator_added', etc.
    description TEXT,
    metadata JSONB, -- Additional activity-specific data
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_collaborators_project_id ON collaborators(project_id);
CREATE INDEX idx_collaborators_user_id ON collaborators(user_id);
CREATE INDEX idx_collaborators_status ON collaborators(status);
CREATE INDEX idx_comments_project_id ON comments(project_id);
CREATE INDEX idx_comments_screenplay_id ON comments(screenplay_id);
CREATE INDEX idx_comments_script_element_id ON comments(script_element_id);
CREATE INDEX idx_comments_scene_id ON comments(scene_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_edit_sessions_project_id ON edit_sessions(project_id);
CREATE INDEX idx_edit_sessions_screenplay_id ON edit_sessions(screenplay_id);
CREATE INDEX idx_edit_sessions_user_id ON edit_sessions(user_id);
CREATE INDEX idx_edit_sessions_active ON edit_sessions(is_active);
CREATE INDEX idx_edit_operations_session_id ON edit_operations(session_id);
CREATE INDEX idx_edit_operations_timestamp ON edit_operations(timestamp);
CREATE INDEX idx_user_presence_user_id ON user_presence(user_id);
CREATE INDEX idx_user_presence_project_id ON user_presence(project_id);
CREATE INDEX idx_user_presence_online ON user_presence(is_online);
CREATE INDEX idx_comment_mentions_comment_id ON comment_mentions(comment_id);
CREATE INDEX idx_comment_mentions_user_id ON comment_mentions(mentioned_user_id);
CREATE INDEX idx_collaboration_invitations_token ON collaboration_invitations(token);
CREATE INDEX idx_collaboration_invitations_project_id ON collaboration_invitations(project_id);
CREATE INDEX idx_project_activity_project_id ON project_activity(project_id);
CREATE INDEX idx_project_activity_user_id ON project_activity(user_id);
CREATE INDEX idx_project_activity_created_at ON project_activity(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function to update last_activity on edit sessions
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update session activity
CREATE TRIGGER update_edit_sessions_activity BEFORE UPDATE ON edit_sessions
    FOR EACH ROW EXECUTE PROCEDURE update_session_activity();

-- Function to update user presence
CREATE OR REPLACE FUNCTION update_presence_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update presence last_seen
CREATE TRIGGER update_user_presence_last_seen BEFORE UPDATE ON user_presence
    FOR EACH ROW EXECUTE PROCEDURE update_presence_last_seen();

-- Function to log project activity
CREATE OR REPLACE FUNCTION log_project_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- This can be customized based on what table triggered it
    INSERT INTO project_activity (project_id, user_id, activity_type, description)
    VALUES (NEW.project_id, NEW.user_id, TG_OP || '_' || TG_TABLE_NAME, 'Auto-generated activity log');
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic activity logging (add as needed)
-- CREATE TRIGGER log_comment_activity AFTER INSERT ON comments
--     FOR EACH ROW EXECUTE PROCEDURE log_project_activity();