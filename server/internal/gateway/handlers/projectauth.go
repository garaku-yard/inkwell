package handlers

import (
	"context"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

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

// isDefiniteDenial reports whether err is a definitive "not this access path"
// answer (the resource doesn't exist under this lookup, or the caller was
// explicitly refused) as opposed to a dependency problem (unavailable,
// timed out, or anything else unrecognised). ResolveProjectRole's three
// checks (owner, org member, collaborator) fall through to the next one only
// on a definite denial — any other error must propagate so the caller fails
// closed instead of silently reading it as "try the next check".
func isDefiniteDenial(err error) bool {
	switch status.Code(err) {
	case codes.PermissionDenied, codes.NotFound:
		return true
	default:
		return false
	}
}

// mapOrgRole translates a workspace org role into the coarser ProjectRole
// this project's policy reasons about. Org "owner" and "admin" both become
// RoleOrgAdmin — see ProjectRole's doc comment for what that grants.
func mapOrgRole(role string) ProjectRole {
	switch role {
	case "owner", "admin":
		return RoleOrgAdmin
	case "editor":
		return RoleEditor
	case "viewer":
		return RoleViewer
	default:
		return RoleNone
	}
}

// mapCollabRole translates a collab-service collaborator role into
// ProjectRole. An unrecognised or empty role (a row the two services'
// vocabularies have drifted on, or a zero-value in a test fixture) maps to
// RoleNone rather than guessing — silently granting access on an unknown
// value is exactly the failure mode this policy exists to close.
//
// "owner" also maps to RoleNone, deliberately — never RoleOwner. Only
// scripts.projects.owner_id (checked by ResolveProjectRole's fast path,
// before this function is ever reached) is authoritative for ownership per
// 0029's authority table; a collab collaborator row is a projection of that
// fact, not a second source of it (AddCollaboratorDirect writes one when
// CreateProject registers the real owner, but it can go stale — collab.go's
// own comment on that call names it as fire-and-forget, non-fatal, and
// currently undocumented as a projection — see #362). Reaching this function
// with role=="owner" therefore only happens when scripts has already said
// "you are not the owner": trusting the row anyway would let a stale,
// mistaken, or corrupt projection manufacture owner-level access —
// including collaborator management — that scripts itself just refused.
func mapCollabRole(role string) ProjectRole {
	switch role {
	case "editor":
		return RoleEditor
	case "viewer":
		return RoleViewer
	default:
		return RoleNone
	}
}

// ResolveProjectRole determines userID's role on projectID by checking
// literal project ownership (scripts is authoritative for
// projects.owner_id) first, then combining two independent, non-exclusive
// sources: membership in the project's org (if any) and an active
// collab-service collaborator row. A caller can legitimately hold both at
// once — an org viewer explicitly added as a direct project editor, say —
// and this returns whichever grants more, never the one that happened to be
// checked first: a direct project role does not mask a higher org role, and
// an org role does not mask a higher direct grant.
//
// It returns (RoleNone, nil) when none of the checks holds — that is a real
// "no access" answer, distinct from a non-nil error, which always means a
// dependency could not give a trustworthy answer (see isDefiniteDenial) and
// must be treated as unavailable, never as "no access". Callers that need an
// HTTP-facing decision should use RequireProjectAccess instead of calling
// this directly.
func ResolveProjectRole(
	ctx context.Context,
	userID, projectID string,
	sc scriptspb.ScriptsServiceClient,
	cc collab.CollaborationServiceClient,
	wc workspacepb.WorkspaceServiceClient,
) (ProjectRole, error) {
	best := RoleNone
	metadata, metadataErr := sc.GetProjectAccessMetadata(ctx, &scriptspb.GetProjectAccessMetadataRequest{ProjectId: projectID})
	if metadataErr != nil && !isDefiniteDenial(metadataErr) {
		return RoleNone, metadataErr
	}
	// scripts.projects.owner_id is the sole ownership authority. Resolve it
	// through the narrow metadata RPC rather than performing a protected
	// GetProject read before the caller's role has been established.
	if metadataErr == nil && metadata.GetOwnerId() == userID {
		return RoleOwner, nil
	}

	// Org path: use the narrow metadata lookup added by #360. This is not a
	// project read and carries no actor or authorization assertion; it returns
	// only the org id needed to resolve the caller's workspace role.
	if wc != nil && metadataErr == nil {
		if orgID := metadata.GetOrgId(); orgID != "" {
			member, err := wc.GetOrgMember(ctx, &workspacepb.GetOrgMemberRequest{OrgId: orgID, UserId: userID})
			switch {
			case err == nil:
				if r := mapOrgRole(member.GetMember().GetRole()); r > best {
					best = r
				}
			case !isDefiniteDenial(err):
				return RoleNone, err
			}
			// Definite denial (not an org member) contributes nothing —
			// still check the collaborator path below.
		}
	}

	// Collaborator path: use the narrow single-user lookup. Listing every
	// collaborator is a protected operation and cannot itself be used to decide
	// whether the caller may list collaborators.
	if cc != nil {
		collabResp, err := cc.GetProjectCollaboratorRole(ctx, &collab.GetProjectCollaboratorRoleRequest{
			ProjectId: projectID,
			UserId:    userID,
		})
		if err != nil {
			if !isDefiniteDenial(err) {
				return RoleNone, err
			}
		} else if collabResp.GetStatus() == "active" {
			if r := mapCollabRole(collabResp.GetRole()); r > best {
				best = r
			}
		}
	}

	return best, nil
}

// RequireProjectAccess is the legacy convenience wrapper for call sites that
// need only a yes/no gateway decision. Protected downstream RPCs should use
// RequireProjectRole and forward the real actor plus the typed role assertion.
//
// A non-nil error is always an *apierror.Error ready to return straight from
// a handler: CodePermissionDenied/403 for a real denial, or whatever
// apierror.FromError makes of a dependency failure (CodeUnavailable/503,
// CodeDeadlineExceeded/504, ...) — never 403 for the latter, so a downed
// dependency can't be misread as "this caller is unauthorized" and, for a
// write, can't be misread as "proceed".
func RequireProjectAccess(
	ctx context.Context,
	userID, projectID string,
	action ProjectAction,
	sc scriptspb.ScriptsServiceClient,
	cc collab.CollaborationServiceClient,
	wc workspacepb.WorkspaceServiceClient,
) (string, error) {
	role, err := ResolveProjectRole(ctx, userID, projectID, sc, cc, wc)
	if err != nil {
		return "", apierror.FromError(err)
	}
	if !Can(role, action) {
		return "", apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "Forbidden")
	}
	if role == RoleOwner {
		return userID, nil
	}
	return "", nil
}

// RequireProjectRole resolves userID's role on projectID and checks it
// against action via Can, exactly like RequireProjectAccess — but returns
// the resolved ProjectRole itself rather than collapsing it into the
// owner-id-or-empty-sentinel scripts-service used to require. Orbit #360:
// scripts-service now always receives the real, unmodified userID plus this
// role (mapped to the downstream service's CallerRole), never an empty id
// standing in for "already authorized".
//
// Error handling matches RequireProjectAccess: a non-nil error is always a
// ready-to-return *apierror.Error, never a bare 403 for a dependency
// failure.
func RequireProjectRole(
	ctx context.Context,
	userID, projectID string,
	action ProjectAction,
	sc scriptspb.ScriptsServiceClient,
	cc collab.CollaborationServiceClient,
	wc workspacepb.WorkspaceServiceClient,
) (ProjectRole, error) {
	role, err := ResolveProjectRole(ctx, userID, projectID, sc, cc, wc)
	if err != nil {
		return RoleNone, apierror.FromError(err)
	}
	if !Can(role, action) {
		return RoleNone, apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "Forbidden")
	}
	return role, nil
}
