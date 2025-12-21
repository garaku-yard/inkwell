-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Collaborators table
CREATE TABLE IF NOT EXISTS collaborators (
    collaborator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    invited_by UUID NOT NULL,
    invited_at TIMESTAMP NOT NULL DEFAULT NOW(),
    joined_at TIMESTAMP,
    CONSTRAINT chk_role CHECK (role IN ('owner', 'editor', 'viewer', 'commenter')),
    CONSTRAINT chk_status CHECK (status IN ('pending', 'active', 'inactive', 'removed'))
);

CREATE INDEX idx_collaborators_project_id ON collaborators(project_id);
CREATE INDEX idx_collaborators_user_id ON collaborators(user_id);
CREATE UNIQUE INDEX idx_collaborators_project_user ON collaborators(project_id, user_id);

-- Invitations table
CREATE TABLE IF NOT EXISTS invitations (
    invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    inviter_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    accepted BOOLEAN NOT NULL DEFAULT false,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_role CHECK (role IN ('editor', 'viewer', 'commenter'))
);

CREATE INDEX idx_invitations_project_id ON invitations(project_id);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_token ON invitations(token);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    screenplay_id UUID,
    script_element_id UUID,
    scene_id UUID,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    line_number INT,
    char_position INT,
    parent_id UUID REFERENCES comments(comment_id) ON DELETE CASCADE,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_project_id ON comments(project_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_screenplay_id ON comments(screenplay_id);
CREATE INDEX idx_comments_script_element_id ON comments(script_element_id);
CREATE INDEX idx_comments_scene_id ON comments(scene_id);

-- Edit sessions table
CREATE TABLE IF NOT EXISTS edit_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    screenplay_id UUID,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP
);

CREATE INDEX idx_edit_sessions_project_id ON edit_sessions(project_id);
CREATE INDEX idx_edit_sessions_user_id ON edit_sessions(user_id);
CREATE INDEX idx_edit_sessions_screenplay_id ON edit_sessions(screenplay_id);
CREATE INDEX idx_edit_sessions_active ON edit_sessions(project_id, user_id) WHERE ended_at IS NULL;
