import { apiClient } from "@/lib/api"
import { type CollaboratorRole, CollaboratorRoles } from "@/models/constants/collaboratorRoles"

export interface Project {
  id: string
  userId: string
  projectName: string
  description: string
  collaboratorCount: number
  isStarred: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateProjectRequest {
  projectName: string
  description?: string
}

export interface UpdateProjectRequest {
  projectName?: string
  description?: string
}

export interface ScriptElement {
  id: string
  sceneId: string
  elementOrder: number
  elementType: "ACTION" | "CHARACTER" | "DIALOG" | "PARENTHETICAL" | "SHOT" | "TRANSITION"
  content: string
  characterId: string | null
}

export interface Scene {
  id: string
  actId: string
  sceneNumber: number
  setting: string
  elements: ScriptElement[]
}

export interface Act {
  id: string
  projectId: string
  actNumber: number
  title: string | null
  scenes: Scene[]
}

export interface FullProject extends Project {
  acts: Act[]
}

// New interface for project collaborators
export interface ProjectCollaborator {
  id: string
  name: string
  email: string
  usernameWithTag: string
  avatar?: string
  role: CollaboratorRole
  status: "active" | "pending"
  joinedAt: string
  userId: string
}

// --- Service Functions ---

/**
 * Fetches a single, complete project by its ID, including all acts,
 * scenes, and script elements.
 * @param projectId The ID of the project.
 */
export const getProjectById = (projectId: string): Promise<FullProject> => {
  return apiClient<FullProject>(`projects/${projectId}`, {
    method: "GET",
  })
}

/**
 * Fetches a list of all projects for the currently authenticated user.
 */
export const getMyProjects = (): Promise<Project[]> => {
  return apiClient<Project[]>("projects/", {
    method: "GET",
  })
}

/**
 * Creates a new project.
 */
export const createProject = (projectData: CreateProjectRequest): Promise<Project> => {
  return apiClient<Project>("projects/", {
    method: "POST",
    body: projectData,
  })
}

/**
 * Adds a collaborator to a specific project.
 * @param projectId The ID of the project.
 * @param usernameWithTag The "username#tag" of the user to add.
 * @param role The role of the project collaborator
 */
export const addCollaborator = (
  projectId: string,
  usernameWithTag: string,
  role: CollaboratorRole,
): Promise<ProjectCollaborator> => {
  return apiClient<ProjectCollaborator>(`projects/${projectId}/collaborators`, {
    method: "POST",
    body: {
      usernameWithTag,
      role,
    },
  })
}

/**
 * Fetches all collaborators for a specific project
 * @param projectId The ID of the project
 */
export const getProjectCollaborators = (projectId: string): Promise<ProjectCollaborator[]> => {
  return apiClient<ProjectCollaborator[]>(`projects/${projectId}/collaborators`, {
    method: "GET",
  })
}

/**
 * Updates a collaborator's role in a project
 * @param projectId The ID of the project
 * @param collaboratorId The ID of the collaborator
 * @param role The new role for the collaborator
 */
export const updateCollaboratorRole = (
  projectId: string,
  collaboratorId: string,
  role: CollaboratorRole,
): Promise<ProjectCollaborator> => {
  return apiClient<ProjectCollaborator>(`projects/${projectId}/collaborators/${collaboratorId}`, {
    method: "PATCH",
    body: { role },
  })
}

/**
 * Removes a collaborator from a project
 * @param projectId The ID of the project
 * @param collaboratorId The ID of the collaborator to remove
 */
export const removeCollaborator = (projectId: string, collaboratorId: string): Promise<void> => {
  return apiClient<void>(`projects/${projectId}/collaborators/${collaboratorId}`, {
    method: "DELETE",
  })
}

/**
 * Updates an existing project.
 * @param projectId The ID of the project.
 */
export const updateProject = (projectId: string, projectData: UpdateProjectRequest): Promise<Project> => {
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PUT",
    body: projectData,
  })
}

/**
 * Deletes a project.
 * @param projectId The ID of the project.
 */
export const deleteProject = (projectId: string): Promise<void> => {
  return apiClient<void>(`projects/${projectId}`, {
    method: "DELETE",
  })
}

/**
 * Updates the 'starred' status of a project.
 * @param projectId The ID of the project.
 */
export const starProject = (projectId: string, isStarred: boolean): Promise<Project> => {
  return apiClient<Project>(`projects/${projectId}`, {
    method: "PATCH",
    body: { isStarred },
  })
}

/**
 * Updates the setting of a specific scene for autosaving.
 * @param sceneId The ID of the scene.
 * @param setting The new setting text.
 */
export const updateSceneSetting = (sceneId: string, setting: string): Promise<void> => {
  return apiClient<void>(`scenes/${sceneId}`, {
    method: "PATCH",
    body: { setting },
  })
}

/**
 * Updates the content of a specific script element for autosaving.
 * @param elementId The ID of the script element.
 * @param content The new content text.
 */
export const updateScriptElementContent = (elementId: string, content: string): Promise<void> => {
  return apiClient<void>(`script-elements/${elementId}`, {
    method: "PATCH",
    body: { content },
  })
}

/**
 * Creates a new script element within a scene.
 * @param sceneId The ID of the scene to add the element to.
 * @param elementData The partial data for the new element.
 */
export const createElement = (sceneId: string, elementData: Partial<ScriptElement>): Promise<ScriptElement> => {
  return apiClient<ScriptElement>(`scenes/${sceneId}/elements`, {
    method: "POST",
    body: elementData,
  })
}

/**
 * Deletes a script element from a scene.
 * @param elementId The ID of the script element to delete.
 */
export const deleteScriptElement = (elementId: string): Promise<void> => {
  return apiClient<void>(`script-elements/${elementId}`, {
    method: "DELETE",
  })
}

/**
 * Creates a new scene within an act.
 * @param actId The ID of the act to add the scene to.
 * @param sceneData The data for the new scene.
 */
export const createScene = (actId: string, sceneData: { setting: string }): Promise<Scene> => {
  return apiClient<Scene>(`acts/${actId}/scenes`, {
    method: "POST",
    body: sceneData,
  })
}

/**
 * Deletes a scene and all of its contents.
 * @param sceneId The ID of the scene to delete.
 */
export const deleteScene = (sceneId: string): Promise<void> => {
  return apiClient<void>(`scenes/${sceneId}`, {
    method: "DELETE",
  })
}

export const collaboratorRoleOptions = Object.entries(CollaboratorRoles).map(([key, label]) => ({
  value: key as CollaboratorRole,
  label,
}))
