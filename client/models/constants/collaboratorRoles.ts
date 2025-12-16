export const CollaboratorRoles = {
  viewer: "Viewer",
  editor: "Editor",
  owner: "Owner",
} as const

export type CollaboratorRole = keyof typeof CollaboratorRoles

export const collaboratorRoleOptions = Object.entries(CollaboratorRoles).map(([key, label]) => ({
  value: key,
  label,
}))

