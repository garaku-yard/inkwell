# Collaboration Invitation System

## Overview

The collaboration invitation system allows project owners and editors to invite new collaborators to their projects. Invited users receive notifications and can accept or decline invitations through the client interface.

## API Endpoints

### 1. Add Collaborator (Send Invitation)

**POST** `/collaborators`

Send an invitation to a user by their email address.

**Request Body:**
```json
{
  "project_id": "uuid",
  "email": "user@example.com",
  "role": "editor" // or "viewer", "owner"
}
```

**Response:**
```json
{
  "id": "collaborator-uuid",
  "project_id": "project-uuid",
  "user_id": "user-uuid", 
  "email": "user@example.com",
  "role": "editor",
  "status": "pending",
  "invited_at": "2025-11-22T21:30:00Z",
  "message": "Invitation sent successfully"
}
```

**Roles:**
- `owner`: Full project access, can manage collaborators
- `editor`: Can edit content and add comments
- `viewer`: Read-only access, can add comments

### 2. Get User Invitations

**GET** `/invitations`

Get all pending invitations for the current user.

**Headers:**
```
Authorization: Bearer <jwt_token>
X-User-ID: <user_id>
```

**Response:**
```json
[
  {
    "id": "invitation-id",
    "project_id": "project-uuid",
    "project_name": "Example Project",
    "inviter_name": "John Doe",
    "role": "editor",
    "status": "pending",
    "invited_at": "2025-11-22T21:30:00Z",
    "message": "You've been invited to collaborate on this project"
  }
]
```

### 3. Accept Invitation

**POST** `/invitations/accept`

Accept a collaboration invitation.

**Request Body:**
```json
{
  "collaborator_id": "collaborator-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invitation accepted successfully",
  "collaborator": {
    "id": "collaborator-uuid",
    "status": "active",
    "joined_at": "2025-11-22T21:30:00Z"
  }
}
```

### 4. Decline Invitation

**POST** `/invitations/decline`

Decline a collaboration invitation.

**Request Body:**
```json
{
  "collaborator_id": "collaborator-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invitation declined successfully"
}
```

### 5. Get Project Collaborators

**GET** `/collaborators?project_id=<uuid>`

Get all collaborators for a project.

**Response:**
```json
[
  {
    "id": "collaborator-uuid",
    "project_id": "project-uuid",
    "user_id": "user-uuid",
    "role": "owner",
    "status": "active",
    "invited_at": "2025-11-22T20:00:00Z",
    "joined_at": "2025-11-22T20:00:00Z"
  },
  {
    "id": "collaborator-uuid-2",
    "project_id": "project-uuid",
    "user_id": "user-uuid-2",
    "role": "editor", 
    "status": "pending",
    "invited_at": "2025-11-22T21:30:00Z"
  }
]
```

## Frontend Implementation Guide

### 1. Invite Collaborator (Project Settings Page)

```javascript
async function inviteCollaborator(projectId, email, role) {
  try {
    const response = await fetch('/collaborators', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-User-ID': currentUserId
      },
      body: JSON.stringify({
        project_id: projectId,
        email: email,
        role: role
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(`Invitation sent to ${email}`, 'success');
      return result;
    } else {
      showNotification(`Failed to send invitation: ${result.error}`, 'error');
    }
  } catch (error) {
    showNotification('Network error while sending invitation', 'error');
  }
}

// Example usage
inviteCollaborator('project-123', 'newuser@example.com', 'editor');
```

### 2. Load User Invitations (Invites Section)

```javascript
async function loadUserInvitations() {
  try {
    const response = await fetch('/invitations', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-User-ID': currentUserId
      }
    });
    
    const invitations = await response.json();
    
    displayInvitations(invitations);
    return invitations;
  } catch (error) {
    showNotification('Failed to load invitations', 'error');
  }
}

function displayInvitations(invitations) {
  const container = document.getElementById('invitations-list');
  
  if (invitations.length === 0) {
    container.innerHTML = '<p>No pending invitations</p>';
    return;
  }
  
  container.innerHTML = invitations.map(invitation => `
    <div class="invitation-card">
      <h3>${invitation.project_name}</h3>
      <p>Invited by: ${invitation.inviter_name}</p>
      <p>Role: ${invitation.role}</p>
      <p>Invited: ${new Date(invitation.invited_at).toLocaleDateString()}</p>
      <div class="invitation-actions">
        <button onclick="acceptInvitation('${invitation.id}')" class="btn-accept">
          Accept
        </button>
        <button onclick="declineInvitation('${invitation.id}')" class="btn-decline">
          Decline
        </button>
      </div>
    </div>
  `).join('');
}
```

### 3. Accept/Decline Invitations

```javascript
async function acceptInvitation(collaboratorId) {
  try {
    const response = await fetch('/invitations/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-User-ID': currentUserId
      },
      body: JSON.stringify({
        collaborator_id: collaboratorId
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification('Invitation accepted! Welcome to the project.', 'success');
      loadUserInvitations(); // Refresh the list
      redirectToProject(result.collaborator.project_id);
    } else {
      showNotification('Failed to accept invitation', 'error');
    }
  } catch (error) {
    showNotification('Network error', 'error');
  }
}

async function declineInvitation(collaboratorId) {
  if (!confirm('Are you sure you want to decline this invitation?')) {
    return;
  }
  
  try {
    const response = await fetch('/invitations/decline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-User-ID': currentUserId
      },
      body: JSON.stringify({
        collaborator_id: collaboratorId
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification('Invitation declined', 'info');
      loadUserInvitations(); // Refresh the list
    } else {
      showNotification('Failed to decline invitation', 'error');
    }
  } catch (error) {
    showNotification('Network error', 'error');
  }
}
```

### 4. Project Collaborators Management

```javascript
async function loadProjectCollaborators(projectId) {
  try {
    const response = await fetch(`/collaborators?project_id=${projectId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-User-ID': currentUserId
      }
    });
    
    const collaborators = await response.json();
    displayProjectCollaborators(collaborators);
    return collaborators;
  } catch (error) {
    showNotification('Failed to load collaborators', 'error');
  }
}

function displayProjectCollaborators(collaborators) {
  const container = document.getElementById('collaborators-list');
  
  container.innerHTML = collaborators.map(collab => `
    <div class="collaborator-item">
      <div class="collaborator-info">
        <span class="user-name">${collab.user_name || 'User'}</span>
        <span class="role-badge role-${collab.role}">${collab.role}</span>
        <span class="status-badge status-${collab.status}">${collab.status}</span>
      </div>
      <div class="collaborator-meta">
        <small>
          ${collab.status === 'active' ? 
            `Joined ${new Date(collab.joined_at).toLocaleDateString()}` :
            `Invited ${new Date(collab.invited_at).toLocaleDateString()}`
          }
        </small>
      </div>
    </div>
  `).join('');
}
```

## Database Schema

The collaboration system uses the following database structure:

```sql
CREATE TABLE collaborators (
  collaborator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'owner', 'editor', 'viewer'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'inactive'
  invited_by UUID NOT NULL,
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_collaborators_project_id ON collaborators(project_id);
CREATE INDEX idx_collaborators_user_id ON collaborators(user_id);
```

## Status Flow

1. **Invitation Creation**: Status = 'pending', joined_at = null
2. **Acceptance**: Status = 'active', joined_at = current timestamp
3. **Decline**: Record is deleted
4. **Deactivation**: Status = 'inactive' (for removing active collaborators)

## Implementation Status

✅ **Completed:**
- Email-based invitation creation
- Invitation management service layer
- Repository layer with database operations
- Gateway HTTP endpoints
- Role validation and permission checking

🚧 **In Progress:**
- Integration with Identity Service for user lookup
- Real-time notifications
- Email notification system

🔄 **Next Steps:**
1. Integrate with Identity Service to resolve email to user ID
2. Add real-time notifications when invitations are sent/accepted
3. Add email notifications for invitations
4. Add invitation expiration functionality
5. Add bulk invitation capabilities