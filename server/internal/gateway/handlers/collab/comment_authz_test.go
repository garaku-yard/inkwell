package collab

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// orgOnlyScriptsStub denies the owner fast path for every caller (no owner
// exists in these tests) and answers the org-metadata bypass (the empty
// userID read) with a fixed org id — the shape of a project that has no
// owner reachable in-test and is entirely org-governed.
type orgOnlyScriptsStub struct {
	scripts.ScriptsServiceClient
	orgID string
}

func (s orgOnlyScriptsStub) GetProject(_ context.Context, in *scripts.GetProjectRequest, _ ...grpc.CallOption) (*scripts.GetProjectResponse, error) {
	return nil, status.Error(codes.PermissionDenied, "not owner")
}

func (s orgOnlyScriptsStub) GetProjectAccessMetadata(context.Context, *scripts.GetProjectAccessMetadataRequest, ...grpc.CallOption) (*scripts.GetProjectAccessMetadataResponse, error) {
	return &scripts.GetProjectAccessMetadataResponse{OrgId: s.orgID}, nil
}

// orgOnlyWorkspaceStub reports one fixed org member — the "org viewer" whose
// only relationship to the project is org membership, no direct
// collab.collaborators row at all.
type orgOnlyWorkspaceStub struct {
	workspacepb.WorkspaceServiceClient
	orgID, memberUserID, role string
}

func (s orgOnlyWorkspaceStub) GetOrgMember(_ context.Context, in *workspacepb.GetOrgMemberRequest, _ ...grpc.CallOption) (*workspacepb.GetOrgMemberResponse, error) {
	if in.OrgId == s.orgID && in.UserId == s.memberUserID {
		return &workspacepb.GetOrgMemberResponse{Member: &workspacepb.OrgMember{Role: s.role}}, nil
	}
	return nil, status.Error(codes.NotFound, "not a member")
}

// commentCollabStub answers GetResourceProject for one fixed comment (id,
// project, real author), optionally reports one direct collaborator row
// (directUserID/directRole — leave directUserID empty for "org-only, no
// collab.collaborators row at all"), and records whether UpdateComment/
// DeleteComment actually reached collab and — critically — which UserId
// they were dispatched with, so tests can prove the gateway keeps the real
// actor separate from its resolved-role assertion.
type commentCollabStub struct {
	collab.CollaborationServiceClient
	projectID      string
	commentID      string
	commentOwnerID string
	directUserID   string
	directRole     string

	updateCalled     bool
	deleteCalled     bool
	dispatchedUserID string
	dispatchedRole   collab.CallerRole
}

func (s *commentCollabStub) GetProjectCollaborators(context.Context, *collab.GetProjectCollaboratorsRequest, ...grpc.CallOption) (*collab.GetProjectCollaboratorsResponse, error) {
	if s.directUserID == "" {
		return &collab.GetProjectCollaboratorsResponse{}, nil
	}
	return &collab.GetProjectCollaboratorsResponse{
		Collaborators: []*collab.Collaborator{{UserId: s.directUserID, Status: "active", Role: s.directRole}},
	}, nil
}

func (s *commentCollabStub) GetProjectCollaboratorRole(_ context.Context, in *collab.GetProjectCollaboratorRoleRequest, _ ...grpc.CallOption) (*collab.GetProjectCollaboratorRoleResponse, error) {
	if s.directUserID == "" || in.UserId != s.directUserID {
		return nil, status.Error(codes.PermissionDenied, "not a collaborator")
	}
	return &collab.GetProjectCollaboratorRoleResponse{Role: s.directRole, Status: "active"}, nil
}

func (s *commentCollabStub) GetResourceProject(_ context.Context, in *collab.GetResourceProjectRequest, _ ...grpc.CallOption) (*collab.GetResourceProjectResponse, error) {
	if in.ResourceType != collab.ResourceType_RESOURCE_TYPE_COMMENT || in.ResourceId != s.commentID {
		return nil, status.Error(codes.NotFound, "comment not found")
	}
	return &collab.GetResourceProjectResponse{ProjectId: s.projectID, OwnerUserId: s.commentOwnerID}, nil
}

func (s *commentCollabStub) UpdateComment(_ context.Context, req *collab.UpdateCommentRequest, _ ...grpc.CallOption) (*collab.UpdateCommentResponse, error) {
	s.updateCalled = true
	s.dispatchedUserID = req.UserId
	s.dispatchedRole = req.CallerRole
	return &collab.UpdateCommentResponse{Comment: &collab.Comment{Id: s.commentID, ProjectId: s.projectID, UserId: s.commentOwnerID}}, nil
}

func (s *commentCollabStub) DeleteComment(_ context.Context, req *collab.DeleteCommentRequest, _ ...grpc.CallOption) (*collab.DeleteCommentResponse, error) {
	s.deleteCalled = true
	s.dispatchedUserID = req.UserId
	s.dispatchedRole = req.CallerRole
	return &collab.DeleteCommentResponse{Success: true}, nil
}

// authedRequest builds a request carrying callerID as the authenticated user.
func authedRequest(t *testing.T, method, path, callerID, body string) *http.Request {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	return r.WithContext(contextx.WithUserID(r.Context(), callerID))
}

// The Orbit #359 review regression: an org-only viewer (org role "viewer",
// no collab.collaborators row) must be able to edit their own comment, but
// must not be able to touch — edit, resolve, or delete — someone else's.
// Before this fix, both endpoints ran either no gateway check or a coarse
// ActionCommentAdd gate that granted the same access regardless of
// authorship, which combined with collab-service's own CheckPermission
// fallback (#366) let an org viewer moderate a stranger's comment.
const (
	orgViewerOrgID     = "org-1"
	orgViewerUserID    = "org-viewer-1"
	orgViewerAuthorID  = "author-1"
	orgViewerProjectID = "proj-1"
	orgViewerCommentID = "comment-1"
)

func newOrgOnlyCommentHandler(commentOwnerID string) (*CollaborationHandler, *commentCollabStub) {
	cc := &commentCollabStub{projectID: orgViewerProjectID, commentID: orgViewerCommentID, commentOwnerID: commentOwnerID}
	h := &CollaborationHandler{
		client:          cc,
		scriptsClient:   orgOnlyScriptsStub{orgID: orgViewerOrgID},
		workspaceClient: orgOnlyWorkspaceStub{orgID: orgViewerOrgID, memberUserID: orgViewerUserID, role: "viewer"},
	}
	return h, cc
}

// newRoleCommentHandler builds a handler for callerID with an org role of
// orgRole and, when directRole is non-empty, an additional direct
// collaborator row of that role for the same user — the "mixed role"
// shape the second review round covered.
func newRoleCommentHandler(commentOwnerID, callerID, orgRole, directRole string) (*CollaborationHandler, *commentCollabStub) {
	cc := &commentCollabStub{
		projectID:      orgViewerProjectID,
		commentID:      orgViewerCommentID,
		commentOwnerID: commentOwnerID,
	}
	if directRole != "" {
		cc.directUserID = callerID
		cc.directRole = directRole
	}
	h := &CollaborationHandler{
		client:          cc,
		scriptsClient:   orgOnlyScriptsStub{orgID: orgViewerOrgID},
		workspaceClient: orgOnlyWorkspaceStub{orgID: orgViewerOrgID, memberUserID: callerID, role: orgRole},
	}
	return h, cc
}

func TestUpdateComment_OrgOnlyViewer(t *testing.T) {
	t.Run("editing own comment is allowed", func(t *testing.T) {
		h, cc := newOrgOnlyCommentHandler(orgViewerUserID)
		req := authedRequest(t, http.MethodPatch, "/comments/"+orgViewerCommentID, orgViewerUserID, `{"content":"edited"}`)
		rec := httptest.NewRecorder()
		h.UpdateComment(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
		}
		if !cc.updateCalled {
			t.Error("UpdateComment was not dispatched for the comment's own author")
		}
	})

	t.Run("editing someone else's comment is forbidden", func(t *testing.T) {
		h, cc := newOrgOnlyCommentHandler(orgViewerAuthorID)
		req := authedRequest(t, http.MethodPatch, "/comments/"+orgViewerCommentID, orgViewerUserID, `{"content":"edited"}`)
		rec := httptest.NewRecorder()
		h.UpdateComment(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403, body=%s", rec.Code, rec.Body.String())
		}
		if cc.updateCalled {
			t.Error("UpdateComment reached collab for a viewer moderating another user's comment — the #366 gap")
		}
	})

	t.Run("resolving your own comment's thread is still moderation", func(t *testing.T) {
		h, cc := newOrgOnlyCommentHandler(orgViewerUserID)
		req := authedRequest(t, http.MethodPatch, "/comments/"+orgViewerCommentID, orgViewerUserID, `{"is_resolved":true}`)
		rec := httptest.NewRecorder()
		h.UpdateComment(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403 — resolving is always moderation, even on your own comment; body=%s", rec.Code, rec.Body.String())
		}
		if cc.updateCalled {
			t.Error("UpdateComment reached collab for a viewer resolving a thread")
		}
	})
}

func TestDeleteComment_OrgOnlyViewer(t *testing.T) {
	t.Run("deleting own comment is allowed", func(t *testing.T) {
		h, cc := newOrgOnlyCommentHandler(orgViewerUserID)
		req := authedRequest(t, http.MethodDelete, "/comments/"+orgViewerCommentID, orgViewerUserID, "")
		rec := httptest.NewRecorder()
		h.DeleteComment(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
		}
		if !cc.deleteCalled {
			t.Error("DeleteComment was not dispatched for the comment's own author")
		}
	})

	t.Run("deleting someone else's comment is forbidden", func(t *testing.T) {
		h, cc := newOrgOnlyCommentHandler(orgViewerAuthorID)
		req := authedRequest(t, http.MethodDelete, "/comments/"+orgViewerCommentID, orgViewerUserID, "")
		rec := httptest.NewRecorder()
		h.DeleteComment(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403, body=%s", rec.Code, rec.Body.String())
		}
		if cc.deleteCalled {
			t.Error("DeleteComment reached collab for a viewer moderating another user's comment — the #366 gap")
		}
	})
}

// TestModerateComment_ForwardsRealActorAndResolvedRole is the second review
// round's regression: the gateway resolves an editor's effective role by
// combining org membership and a direct collaborator row (ADR 0030,
// "highest wins"), but collab-service's own CheckPermission only ever sees
// the direct row — it has no concept of org membership at all
// (GetUserProjectRole queries nothing but the collaborators table). The RPC
// now forwards the real actor for audit/authorship semantics and separately
// carries the gateway's combined role assertion.
func TestModerateComment_ForwardsRealActorAndResolvedRole(t *testing.T) {
	cases := []struct {
		name       string
		orgRole    string
		directRole string // "" = org-only, no direct collaborator row
	}{
		{"org editor with a lower direct viewer row", "editor", "viewer"},
		{"org-only editor, no direct row at all", "editor", ""},
		{"org admin, no direct row at all", "admin", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			const callerID = "mixed-role-caller"

			t.Run("UpdateComment", func(t *testing.T) {
				h, cc := newRoleCommentHandler(orgViewerAuthorID, callerID, tc.orgRole, tc.directRole)
				req := authedRequest(t, http.MethodPatch, "/comments/"+orgViewerCommentID, callerID, `{"content":"moderated"}`)
				rec := httptest.NewRecorder()
				h.UpdateComment(rec, req)
				if rec.Code != http.StatusOK {
					t.Fatalf("status = %d, want 200 (org role %q should permit moderation) body=%s", rec.Code, tc.orgRole, rec.Body.String())
				}
				if !cc.updateCalled {
					t.Fatal("UpdateComment was not dispatched")
				}
				if cc.dispatchedUserID != callerID {
					t.Errorf("dispatched with UserId %q, want real actor %q", cc.dispatchedUserID, callerID)
				}
				if cc.dispatchedRole < collab.CallerRole_CALLER_ROLE_EDITOR {
					t.Errorf("dispatched with caller role %v, want editor or stronger", cc.dispatchedRole)
				}
			})

			t.Run("DeleteComment", func(t *testing.T) {
				h, cc := newRoleCommentHandler(orgViewerAuthorID, callerID, tc.orgRole, tc.directRole)
				req := authedRequest(t, http.MethodDelete, "/comments/"+orgViewerCommentID, callerID, "")
				rec := httptest.NewRecorder()
				h.DeleteComment(rec, req)
				if rec.Code != http.StatusOK {
					t.Fatalf("status = %d, want 200 (org role %q should permit moderation) body=%s", rec.Code, tc.orgRole, rec.Body.String())
				}
				if !cc.deleteCalled {
					t.Fatal("DeleteComment was not dispatched")
				}
				if cc.dispatchedUserID != callerID {
					t.Errorf("dispatched with UserId %q, want real actor %q", cc.dispatchedUserID, callerID)
				}
				if cc.dispatchedRole < collab.CallerRole_CALLER_ROLE_EDITOR {
					t.Errorf("dispatched with caller role %v, want editor or stronger", cc.dispatchedRole)
				}
			})
		})
	}
}

// TestSelfEditComment_ForwardsRealID is the counterpart: the self-edit tier
// still needs the real caller id, because collab-service's own UpdateComment/
// DeleteComment skip CheckPermission entirely on an authorship match — using
// the sentinel there would defeat that match and misroute a legitimate
// self-edit through the moderate-only path.
func TestSelfEditComment_ForwardsRealID(t *testing.T) {
	const callerID = "self-editor"

	t.Run("UpdateComment", func(t *testing.T) {
		h, cc := newRoleCommentHandler(callerID, callerID, "viewer", "")
		req := authedRequest(t, http.MethodPatch, "/comments/"+orgViewerCommentID, callerID, `{"content":"my own edit"}`)
		rec := httptest.NewRecorder()
		h.UpdateComment(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
		}
		if cc.dispatchedUserID != callerID {
			t.Errorf("dispatched with UserId %q, want the real caller id %q", cc.dispatchedUserID, callerID)
		}
	})

	t.Run("DeleteComment", func(t *testing.T) {
		h, cc := newRoleCommentHandler(callerID, callerID, "viewer", "")
		req := authedRequest(t, http.MethodDelete, "/comments/"+orgViewerCommentID, callerID, "")
		rec := httptest.NewRecorder()
		h.DeleteComment(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
		}
		if cc.dispatchedUserID != callerID {
			t.Errorf("dispatched with UserId %q, want the real caller id %q", cc.dispatchedUserID, callerID)
		}
	})
}
