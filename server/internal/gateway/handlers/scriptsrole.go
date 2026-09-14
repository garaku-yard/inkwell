package handlers

import scriptspb "inkwell/server/pkg/grpc/scripts"

// ScriptsCallerRole maps the gateway's resolved application role to the
// assertion carried across the scripts gRPC boundary. HTTP handlers and hosted
// tool operations share this mapping so neither transport can reinterpret a
// role independently.
func ScriptsCallerRole(role ProjectRole) scriptspb.CallerRole {
	switch role {
	case RoleOwner:
		return scriptspb.CallerRole_CALLER_ROLE_OWNER
	case RoleOrgAdmin:
		return scriptspb.CallerRole_CALLER_ROLE_ORG_ADMIN
	case RoleEditor:
		return scriptspb.CallerRole_CALLER_ROLE_EDITOR
	case RoleViewer:
		return scriptspb.CallerRole_CALLER_ROLE_VIEWER
	default:
		return scriptspb.CallerRole_CALLER_ROLE_UNSPECIFIED
	}
}
