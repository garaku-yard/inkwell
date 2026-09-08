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
	// Fast path: owner check. The only source that can ever produce
	// RoleOwner — see mapCollabRole's doc comment for why a collab
	// collaborator row must not be able to.
	if _, err := sc.GetProject(ctx, &scriptspb.GetProjectRequest{ProjectId: projectID, UserId: userID}); err == nil {
		return RoleOwner, nil
	} else if !isDefiniteDenial(err) {
		return RoleNone, err
	}

	best := RoleNone

	// Org path: read the project's metadata with the nil-user bypass (a
	// read-only lookup to learn the org id, not a grant of access — the
	// caller's own access is decided below by their resolved org role).
	if wc != nil {
		meta, err := sc.GetProject(ctx, &scriptspb.GetProjectRequest{ProjectId: projectID, UserId: ""})
		if err != nil && !isDefiniteDenial(err) {
			return RoleNone, err
		}
		if err == nil {
			if orgID := meta.GetProject().GetOrgId(); orgID != "" {
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
	}

	// Collaborator path: an active row in collab-service. Combined with the
	// org result above via "highest wins", not returned early.
	if cc != nil {
		collabResp, err := cc.GetProjectCollaborators(ctx, &collab.GetProjectCollaboratorsRequest{
			ProjectId: projectID,
			UserId:    userID,
		})
		if err != nil {
			if !isDefiniteDenial(err) {
				return RoleNone, err
			}
		} else {
			for _, c := range collabResp.Collaborators {
				if c.UserId == userID && c.Status == "active" {
					if r := mapCollabRole(c.Role); r > best {
						best = r
					}
					break
				}
			}
		}
	}

	return best, nil
}

// RequireProjectAccess resolves userID's role on projectID, checks it against
// action via Can, and — when permitted — returns the effective downstream
// user id the existing scripts-service calls expect: the owner's own id, or
// "" for every other permitted role (scripts-service still reads an empty id
// as "the gateway already authorized this"; replacing that sentinel-based
// wire contract is Orbit #360, out of scope here).
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
