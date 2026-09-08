package handlers

// ProjectRole is the caller's resolved level of access to a project. It is
// deliberately coarser than the raw strings collab/workspace store (their
// "owner"/"editor"/"viewer" and "owner"/"admin"/"editor"/"viewer") — see
// mapCollabRole and mapOrgRole, the only two places that translate into it.
type ProjectRole int

const (
	// RoleNone is no membership, a removed/pending collaborator, or a
	// non-member of the project's org. No action is permitted.
	RoleNone ProjectRole = iota
	// RoleViewer is a project collaborator with role "viewer", or a member of
	// the project's org with org role "viewer". Read/export only.
	RoleViewer
	// RoleEditor is a project collaborator with role "editor", or an org
	// member with org role "editor". Content read/write, no project
	// deletion or collaborator management.
	RoleEditor
	// RoleOrgAdmin is a member of the project's org with org role "owner" or
	// "admin". Everything RoleEditor can do, plus collaborator management.
	// Deliberately NOT project deletion (see ProjectAction docs) and not
	// project-metadata management (ActionManageProject) — both stay
	// owner-only; see Can's doc comment for why.
	RoleOrgAdmin
	// RoleOwner is the project's literal owner (scripts.projects.owner_id).
	// Full access.
	RoleOwner
)

func (r ProjectRole) String() string {
	switch r {
	case RoleOwner:
		return "owner"
	case RoleOrgAdmin:
		return "org_admin"
	case RoleEditor:
		return "editor"
	case RoleViewer:
		return "viewer"
	default:
		return "none"
	}
}

// ProjectAction is one thing a caller might do to a project or something in
// it. Keep this list matched to Can's switch — an action with no case there
// denies by default, it doesn't fall through to allow.
//
// Route → action inventory (server/internal/gateway/handlers/scripts,
// .../collab, server/internal/gateway/realtime). Kept here, next to the
// policy it exists to justify, rather than as a separate doc that drifts:
//
//	Action                    Routes
//	ActionRead                GET  /projects/{id}, /scenes?project_id=, /elements?scene_id=,
//	                          /beats/{id}, /connections (read via GetBeat etc.), /lanes,
//	                          /outline-items, /drawings, /beat-board, /edit-sessions,
//	                          GET  /comments (project_id), /collaborators (project_id)
//	ActionExport              GET  /projects/{id}/export
//	ActionEditContent         POST/PUT/PATCH/DELETE  /scenes, /elements, /beats,
//	                          /connections, /lanes(+order), /outline-items, /drawings
//	ActionSyncPush            POST /sync/projects/{id}, /sync/vault/projects/{id}
//	ActionCommentAdd          POST /comments
//	ActionCommentModerate     PATCH/DELETE /comments/{id} (when not the comment's own author —
//	                          collab.CheckPermission enforces the authorship exception downstream)
//	ActionRealtimeEdit        WS "edit" frames on /ws/projects/{id} (connecting itself only needs ActionRead)
//	ActionManageCollaborators POST/PATCH/DELETE /projects/{id}/collaborators*, /collaborators*
//	ActionManageProject       PUT /projects/{id}, PATCH /projects/{id}/star
//	ActionDeleteProject       DELETE /projects/{id}
type ProjectAction int

const (
	ActionRead ProjectAction = iota
	ActionExport
	ActionEditContent
	ActionSyncPush
	ActionCommentAdd
	ActionCommentModerate
	ActionRealtimeEdit
	ActionManageCollaborators
	ActionManageProject
	ActionDeleteProject
)

func (a ProjectAction) String() string {
	switch a {
	case ActionRead:
		return "read"
	case ActionExport:
		return "export"
	case ActionEditContent:
		return "edit_content"
	case ActionSyncPush:
		return "sync_push"
	case ActionCommentAdd:
		return "comment_add"
	case ActionCommentModerate:
		return "comment_moderate"
	case ActionRealtimeEdit:
		return "realtime_edit"
	case ActionManageCollaborators:
		return "manage_collaborators"
	case ActionManageProject:
		return "manage_project"
	case ActionDeleteProject:
		return "delete_project"
	default:
		return "unknown"
	}
}

// Can reports whether role may perform action. Pure and total — every
// ProjectAction has an explicit case, and an unrecognised action denies
// rather than falling through, so a future action added without a case here
// fails closed instead of silently allowing everyone.
//
// This is the minimum matrix from Orbit #359, plus two deliberate deviations
// from what "org admin: edit content" might suggest, both because the
// backing scripts-service calls enforce a literal IsProjectOwner check with
// no org-aware or bypass-sentinel branch (UpdateProject, ToggleProjectStar,
// DeleteProject — see internal/scripts/service/scripts_service.go), and
// loosening that is a service-layer change this containment task's zone and
// non-goals ("do not weaken existing owner checks") put out of scope:
//
//   - ActionManageProject (rename/describe/status/star) is owner-only, not
//     "owner + org admin". Granting it to org admin here would have the
//     gateway say yes and scripts-service say no.
//   - ActionDeleteProject is owner-only, per the matrix's own text ("project
//     deletion must be an explicit product decision, not accidental").
func Can(role ProjectRole, action ProjectAction) bool {
	switch action {
	case ActionRead, ActionExport, ActionCommentAdd:
		// Any real membership — even a viewer, even a removed/pending
		// collaborator's replacement RoleNone — down to "no access" only.
		return role != RoleNone
	case ActionEditContent, ActionSyncPush, ActionCommentModerate, ActionRealtimeEdit:
		return role == RoleOwner || role == RoleOrgAdmin || role == RoleEditor
	case ActionManageCollaborators:
		return role == RoleOwner || role == RoleOrgAdmin
	case ActionManageProject, ActionDeleteProject:
		return role == RoleOwner
	default:
		return false
	}
}
