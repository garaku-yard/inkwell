package handlers

import "testing"

// TestCanMatrix pins the full role×action matrix from Orbit #359's minimum
// policy, one row per (role, action) pair so a change to Can shows up as a
// specific, readable failure rather than a diff against a giant table.
func TestCanMatrix(t *testing.T) {
	allActions := []ProjectAction{
		ActionRead, ActionExport, ActionEditContent, ActionSyncPush,
		ActionCommentAdd, ActionCommentModerate, ActionRealtimeEdit,
		ActionManageCollaborators, ActionManageProject, ActionDeleteProject,
	}

	// permitted lists, per role, every action Can must allow. Anything not
	// listed for a role must deny — asserted by the "else" branch below so an
	// action added to allActions without an explicit expectation fails loudly
	// instead of silently passing.
	permitted := map[ProjectRole]map[ProjectAction]bool{
		RoleOwner: {
			ActionRead: true, ActionExport: true, ActionEditContent: true,
			ActionSyncPush: true, ActionCommentAdd: true, ActionCommentModerate: true,
			ActionRealtimeEdit: true, ActionManageCollaborators: true,
			ActionManageProject: true, ActionDeleteProject: true,
		},
		RoleOrgAdmin: {
			ActionRead: true, ActionExport: true, ActionEditContent: true,
			ActionSyncPush: true, ActionCommentAdd: true, ActionCommentModerate: true,
			ActionRealtimeEdit: true, ActionManageCollaborators: true,
			// NOT ActionManageProject or ActionDeleteProject — see Can's doc comment.
		},
		RoleEditor: {
			ActionRead: true, ActionExport: true, ActionEditContent: true,
			ActionSyncPush: true, ActionCommentAdd: true, ActionCommentModerate: true,
			ActionRealtimeEdit: true,
			// NOT ActionManageCollaborators, ActionManageProject, ActionDeleteProject.
		},
		RoleViewer: {
			ActionRead: true, ActionExport: true, ActionCommentAdd: true,
			// NOT ActionEditContent, ActionSyncPush, ActionCommentModerate,
			// ActionRealtimeEdit, ActionManageCollaborators, ActionManageProject,
			// ActionDeleteProject.
		},
		RoleNone: {
			// No access at all — not even read.
		},
	}

	for role, allow := range permitted {
		for _, action := range allActions {
			want := allow[action]
			if got := Can(role, action); got != want {
				t.Errorf("Can(%s, %s) = %v, want %v", role, action, got, want)
			}
		}
	}
}

// TestCanUnknownActionDeniesByDefault guards the "fails closed, not open"
// property Can's doc comment promises: an action with no case in the switch
// must deny for every role, including the owner.
func TestCanUnknownActionDeniesByDefault(t *testing.T) {
	unknown := ProjectAction(999)
	for _, role := range []ProjectRole{RoleNone, RoleViewer, RoleEditor, RoleOrgAdmin, RoleOwner} {
		if Can(role, unknown) {
			t.Errorf("Can(%s, <unknown action>) = true, want false (fail closed)", role)
		}
	}
}
