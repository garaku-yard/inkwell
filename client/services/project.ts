import { apiClient } from "@/lib/api"
import { type CollaboratorRole, CollaboratorRoles } from "@/models/constants/collaboratorRoles"

// Updated Project interface to match microservices backend
export interface Project {
  id: string
  title: string
  description: string
  owner_id: string
  status: string
  created_at: string
  updated_at: string
}

export interface CreateProjectRequest {
  title: string
  description?: string
  owner_id: string
}

export interface UpdateProjectRequest {
  title?: string
  description?: string
  status?: string
}

export interface ScriptElement {
  id: string
  project_id: string
  scene_id?: string
  element_type: "ACTION" | "CHARACTER" | "DIALOG" | "PARENTHETICAL" | "SHOT" | "TRANSITION"
  content: string
  character_id?: string
  line_number: number
  formatting: Record<string, string>
  created_at: string
  updated_at: string
}

export interface Scene {
  id: string
  project_id: string
  outline_unit_id?: string
  scene_heading: string
  content: string
  order_index: number
  elements?: ScriptElement[]  // Elements within the scene
  created_at: string
  updated_at: string
}

export interface Character {
  id: string
  project_id: string
  name: string
  description: string
  role: string
  attributes: Record<string, string>
  created_at: string
  updated_at: string
}

export interface Location {
  id: string
  project_id: string
  name: string
  description: string
  type: string
  created_at: string
  updated_at: string
}

export interface OutlineUnit {
  id: string
  project_id: string
  parent_id?: string
  unit_type: string // "act", "sequence", "beat", "sub-beat"
  title: string
  description: string
  color?: string
  tags: string[]
  icon?: string
  scene_id?: string
  order_index: number
  created_at: string
  updated_at: string
}

// Legacy interfaces for compatibility (will be removed later)
export interface Act {
  id: string
  projectId: string
  actNumber: number
  title: string | null
  scenes: Scene[]
}

export interface FullProject extends Project {
  scenes?: Scene[]
  characters?: Character[]
  locations?: Location[]
  outline_units?: OutlineUnit[]
}

// Project collaborators interface (for future implementation)
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

export interface Comment {
  id: string
  userName: string
  content: string
  timestamp: string
  isResolved: boolean
}

// --- Service Functions ---

/**
 * Creates a new project in the microservices backend.
 */
export const createProject = async (projectData: CreateProjectRequest): Promise<Project> => {
  const response = await apiClient<{ project: Project }>('projects', {
    method: 'POST',
    body: projectData,
  })
  return response.project
}

/**
 * Fetches a single project by its ID.
 */
export const getProjectById = async (projectId: string, userId: string): Promise<Project> => {
  const response = await apiClient<{ project: Project }>(`projects/${projectId}?user_id=${userId}`, {
    method: 'GET',
  })
  return response.project
}

/**
 * Fetches all projects for the authenticated user.
 */
export const getMyProjects = async (userId: string): Promise<{ projects: Project[], total: number }> => {
  return apiClient<{ projects: Project[], total: number }>(`projects?user_id=${userId}`, {
    method: 'GET',
  })
}

/**
 * Updates an existing project.
 */
export const updateProject = async (
  projectId: string,
  userId: string,
  projectData: UpdateProjectRequest
): Promise<Project> => {
  const response = await apiClient<{ project: Project }>(`projects/${projectId}`, {
    method: 'PUT',
    body: { ...projectData, user_id: userId },
  })
  return response.project
}

/**
 * Deletes a project.
 */
export const deleteProject = async (projectId: string, userId: string): Promise<void> => {
  return apiClient<void>(`projects/${projectId}`, {
    method: 'DELETE',
    body: { user_id: userId },
  })
}

// Get full project with scenes and elements
export const getFullProject = async (projectId: string, userId: string): Promise<FullProject> => {
  // Get the basic project info
  const projectResponse = await apiClient<{ project: Project }>(`projects/${projectId}?user_id=${userId}`, {
    method: 'GET',
  })
  
  // Get the scenes for this project
  const scenes = await getProjectScenes(projectId, userId)
  
  // For each scene, get its elements
  const scenesWithElements = await Promise.all(
    scenes.map(async (scene) => {
      try {
        const elements = await getSceneElements(scene.id, userId)
        return { ...scene, elements }
      } catch (err) {
        console.warn(`Failed to load elements for scene ${scene.id}:`, err)
        return { ...scene, elements: [] }
      }
    })
  )
  
  return {
    ...projectResponse.project,
    scenes: scenesWithElements,
  }
}

// Scene management functions
export const createScene = async (
  projectId: string,
  userId: string,
  sceneData: {
    scene_heading: string
    content?: string
    outline_unit_id?: string
    order_index?: number
  }
): Promise<Scene> => {
  const response = await apiClient<{ scene: Scene }>('scenes', {
    method: 'POST',
    body: {
      project_id: projectId,
      user_id: userId,
      ...sceneData,
    },
  })
  return response.scene
}

export const getProjectScenes = async (projectId: string, userId: string): Promise<Scene[]> => {
  const response = await apiClient<{ scenes: Scene[] }>(`scenes?project_id=${projectId}&user_id=${userId}`, {
    method: 'GET',
  })
  return response.scenes
}

export const updateSceneHeading = async (
  sceneId: string,
  userId: string,
  sceneHeading: string
): Promise<Scene> => {
  const response = await apiClient<{ scene: Scene }>(`scenes/${sceneId}`, {
    method: 'PUT',
    body: {
      user_id: userId,
      scene_heading: sceneHeading,
    },
  })
  return response.scene
}

// Script Element management functions
export const createElement = async (
  projectId: string,
  userId: string,
  elementData: {
    scene_id: string // Required - elements must belong to a scene
    element_type: "ACTION" | "CHARACTER" | "DIALOG" | "PARENTHETICAL" | "SHOT" | "TRANSITION"
    content: string
    character_id?: string
    line_number?: number
    formatting?: Record<string, string>
  }
): Promise<ScriptElement> => {
  const response = await apiClient<{ element: ScriptElement }>('elements', {
    method: 'POST',
    body: {
      project_id: projectId,
      user_id: userId,
      ...elementData,
    },
  })
  return response.element
}

export const updateElementContent = async (
  elementId: string,
  userId: string,
  content: string
): Promise<ScriptElement> => {
  const response = await apiClient<{ element: ScriptElement }>(`elements/${elementId}`, {
    method: 'PUT',
    body: {
      user_id: userId,
      content: content,
    },
  })
  return response.element
}

export const getSceneElements = async (sceneId: string, userId: string): Promise<ScriptElement[]> => {
  const response = await apiClient<{ elements: ScriptElement[] }>(`elements?scene_id=${sceneId}&user_id=${userId}`, {
    method: 'GET',
  })
  return response.elements
}

// Character management functions
export const createCharacter = async (
  projectId: string,
  userId: string,
  characterData: {
    name: string
    description?: string
    role?: string
    attributes?: Record<string, string>
  }
): Promise<Character> => {
  const response = await apiClient<{ character: Character }>('characters', {
    method: 'POST',
    body: {
      project_id: projectId,
      user_id: userId,
      ...characterData,
    },
  })
  return response.character
}

export const getProjectCharacters = async (projectId: string, userId: string): Promise<Character[]> => {
  const response = await apiClient<{ characters: Character[] }>(`characters?project_id=${projectId}&user_id=${userId}`, {
    method: 'GET',
  })
  return response.characters
}

// Location management functions
export const createLocation = async (
  projectId: string,
  userId: string,
  locationData: {
    name: string
    description?: string
    type?: string
  }
): Promise<Location> => {
  const response = await apiClient<{ location: Location }>('locations', {
    method: 'POST',
    body: {
      project_id: projectId,
      user_id: userId,
      ...locationData,
    },
  })
  return response.location
}

export const getProjectLocations = async (projectId: string, userId: string): Promise<Location[]> => {
  const response = await apiClient<{ locations: Location[] }>(`locations?project_id=${projectId}&user_id=${userId}`, {
    method: 'GET',
  })
  return response.locations
}

// Script element management functions
export const createScriptElement = async (
  projectId: string,
  userId: string,
  elementData: {
    scene_id: string // Required - elements must belong to a scene
    element_type: string
    content: string
    character_id?: string
    line_number: number
    formatting?: Record<string, string>
  }
): Promise<ScriptElement> => {
  const response = await apiClient<{ script_element: ScriptElement }>('script-elements', {
    method: 'POST',
    body: {
      project_id: projectId,
      user_id: userId,
      ...elementData,
    },
  })
  return response.script_element
}

export const getProjectScriptElements = async (
  projectId: string,
  userId: string,
  startLine?: number,
  endLine?: number
): Promise<ScriptElement[]> => {
  let url = `script-elements?project_id=${projectId}&user_id=${userId}`
  if (startLine !== undefined) url += `&start_line=${startLine}`
  if (endLine !== undefined) url += `&end_line=${endLine}`
  
  const response = await apiClient<{ script_elements: ScriptElement[] }>(url, {
    method: 'GET',
  })
  return response.script_elements
}

// Legacy functions for backward compatibility (will be updated gradually)

/**
 * @deprecated Use getProjectById instead
 */
export const getProjectByIdLegacy = (projectId: string): Promise<FullProject> => {
  return apiClient<FullProject>(`projects/${projectId}`, {
    method: "GET",
  })
}

/**
 * @deprecated Use createScene instead
 */
export const createSceneLegacy = (actId: string, sceneData: { setting: string }): Promise<Scene> => {
  return apiClient<Scene>(`acts/${actId}/scenes`, {
    method: "POST",
    body: sceneData,
  })
}

// Collaborator functions (placeholder - will be implemented later)
export const addCollaborator = (
  projectId: string,
  usernameWithTag: string,
  role: CollaboratorRole
): Promise<ProjectCollaborator> => {
  throw new Error("Collaborators not yet implemented in microservices backend")
}

export const getProjectCollaborators = (projectId: string): Promise<ProjectCollaborator[]> => {
  throw new Error("Collaborators not yet implemented in microservices backend")
}

export const updateCollaboratorRole = (
  projectId: string,
  collaboratorId: string,
  role: CollaboratorRole
): Promise<ProjectCollaborator> => {
  throw new Error("Collaborators not yet implemented in microservices backend")
}

export const removeCollaborator = (
  projectId: string,
  collaboratorId: string
): Promise<void> => {
  throw new Error("Collaborators not yet implemented in microservices backend")
}

export const collaboratorRoleOptions = Object.entries(CollaboratorRoles).map(
  ([key, label]) => ({
    value: key as CollaboratorRole,
    label,
  })
)