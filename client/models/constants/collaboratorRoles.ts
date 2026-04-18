export const CollaboratorRoles = {
  viewer: "Viewer",
  editor: "Editor",
  owner: "Owner",
} as const

export type CollaboratorRole = keyof typeof CollaboratorRoles

// owner is excluded from invite options — ownership cannot be transferred via invitation
export const collaboratorRoleOptions = Object.entries(CollaboratorRoles)
  .filter(([key]) => key !== "owner")
  .map(([key, label]) => ({ value: key, label }))

