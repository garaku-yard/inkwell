export const CollaboratorRoles = {
    REVIEWER: "Reviewer",
    EDITOR: "Editor",
    WRITER: "Writer",
  } as const
  
  export type CollaboratorRole = keyof typeof CollaboratorRoles
  
  export const collaboratorRoleOptions = Object.entries(CollaboratorRoles).map(([key, label]) => ({
    value: key,
    label,
  }))
  