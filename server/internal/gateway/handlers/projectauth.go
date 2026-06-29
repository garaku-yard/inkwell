package handlers

import (
	"context"
	"errors"

	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// errProjectUnauthorized is returned when a user has neither owner nor collaborator access.
var errProjectUnauthorized = errors.New("unauthorized")

// ResolveOrgRole returns the caller's role in an organization, or an error if
// they are not a member. Used to authorize org-scoped requests at the gateway.
func ResolveOrgRole(
	ctx context.Context,
	wc workspacepb.WorkspaceServiceClient,
	orgID, userID string,
) (string, error) {
	resp, err := wc.GetOrgMember(ctx, &workspacepb.GetOrgMemberRequest{OrgId: orgID, UserId: userID})
	if err != nil {
		return "", err
	}
	return resp.GetMember().GetRole(), nil
}

// ResolveProjectAccess determines whether userID may access projectID and returns
// the effective userId to pass to downstream gRPC calls:
//   - (userID, nil)  — user is the project owner
//   - ("",   nil)    — user is an org member of the project's org, or an active
//     collaborator; the empty string is the bypass sentinel that tells the
//     scripts service to skip the ownership check
//   - ("",   err)    — user has no access
func ResolveProjectAccess(
	ctx context.Context,
	userID, projectID string,
	sc scriptspb.ScriptsServiceClient,
	cc collab.CollaborationServiceClient,
	wc workspacepb.WorkspaceServiceClient,
) (string, error) {
	// Fast path: owner check
	_, err := sc.GetProject(ctx, &scriptspb.GetProjectRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err == nil {
		return userID, nil
	}

	// Org path: read the project's metadata with the nil-user bypass (a
	// read-only lookup to inform the authorization decision). If the project is
	// owned by an org and the caller is a member of that org, grant access.
	if wc != nil {
		if meta, err := sc.GetProject(ctx, &scriptspb.GetProjectRequest{ProjectId: projectID, UserId: ""}); err == nil {
			if orgID := meta.GetProject().GetOrgId(); orgID != "" {
				if _, err := wc.GetOrgMember(ctx, &workspacepb.GetOrgMemberRequest{OrgId: orgID, UserId: userID}); err == nil {
					return "", nil // org member → bypass sentinel
				}
			}
		}
	}

	// Slow path: check active collaborator list
	collabResp, err := cc.GetProjectCollaborators(ctx, &collab.GetProjectCollaboratorsRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err == nil {
		for _, c := range collabResp.Collaborators {
			if c.UserId == userID && c.Status == "active" {
				return "", nil // bypass sentinel
			}
		}
	}

	return "", errProjectUnauthorized
}
