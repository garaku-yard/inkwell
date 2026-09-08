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
	if in.UserId == "" {
		return &scripts.GetProjectResponse{Project: &scripts.Project{OrgId: s.orgID}}, nil
	}
	return nil, status.Error(codes.PermissionDenied, "not owner")
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

// commentCollabStub has no collaborator rows for anyone (org-only
// membership — GetProjectCollaborators always empty), answers
// GetResourceProject for one fixed comment (id, project, real author), and
// records whether UpdateComment/DeleteComment actually reached collab —
// the thing that must not happen for a denied caller.
type commentCollabStub struct {
	collab.CollaborationServiceClient
	projectID      string
	commentID      string
	commentOwnerID string

	updateCalled bool
	deleteCalled bool
}

func (s *commentCollabStub) GetProjectCollaborators(context.Context, *collab.GetProjectCollaboratorsRequest, ...grpc.CallOption) (*collab.GetProjectCollaboratorsResponse, error) {
	return &collab.GetProjectCollaboratorsResponse{}, nil
}

func (s *commentCollabStub) GetResourceProject(_ context.Context, in *collab.GetResourceProjectRequest, _ ...grpc.CallOption) (*collab.GetResourceProjectResponse, error) {
	if in.ResourceType != collab.ResourceType_RESOURCE_TYPE_COMMENT || in.ResourceId != s.commentID {
		return nil, status.Error(codes.NotFound, "comment not found")
	}
	return &collab.GetResourceProjectResponse{ProjectId: s.projectID, OwnerUserId: s.commentOwnerID}, nil
}

func (s *commentCollabStub) UpdateComment(_ context.Context, _ *collab.UpdateCommentRequest, _ ...grpc.CallOption) (*collab.UpdateCommentResponse, error) {
	s.updateCalled = true
	return &collab.UpdateCommentResponse{Comment: &collab.Comment{Id: s.commentID, ProjectId: s.projectID, UserId: s.commentOwnerID}}, nil
}

func (s *commentCollabStub) DeleteComment(_ context.Context, _ *collab.DeleteCommentRequest, _ ...grpc.CallOption) (*collab.DeleteCommentResponse, error) {
	s.deleteCalled = true
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
