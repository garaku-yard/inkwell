package handlers

import (
	"context"
	"errors"

	"scriptlith/server/pkg/grpc/collab"
	scriptspb "scriptlith/server/pkg/grpc/scripts"
)

// errProjectUnauthorized is returned when a user has neither owner nor collaborator access.
var errProjectUnauthorized = errors.New("unauthorized")

// resolveProjectAccess determines whether userID may access projectID and returns
// the effective userId to pass to downstream gRPC calls:
//   - (userID, nil)  — user is the project owner
//   - ("",   nil)    — user is an active collaborator; empty string is the bypass sentinel
//     that tells the scripts service to skip the ownership check
//   - ("",   err)    — user has no access
func resolveProjectAccess(
	ctx context.Context,
	userID, projectID string,
	sc scriptspb.ScriptsServiceClient,
	cc collab.CollaborationServiceClient,
) (string, error) {
	// Fast path: owner check
	_, err := sc.GetProject(ctx, &scriptspb.GetProjectRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err == nil {
		return userID, nil
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
