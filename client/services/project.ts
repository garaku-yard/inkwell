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
  comments?: Comment[]  // Comments for this element
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
  comments?: Comment[]  // Comments for this scene
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
  elementId?: string // script element ID or scene ID that the comment belongs to
  isScene?: boolean // whether this comment belongs to a scene or script element
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
  
  // Get all comments for the project
  const allComments = await getComments(projectId)
  
  // For each scene, get its elements and attach comments
  const scenesWithElements = await Promise.all(
    scenes.map(async (scene) => {
      try {
        const elements = await getSceneElements(scene.id, userId)
        
        // Attach comments to elements
        const elementsWithComments = elements.map(element => ({
          ...element,
          comments: allComments.filter(comment => comment.elementId === element.id && !comment.isScene)
        }))
        
        // Attach comments to scene
        const sceneComments = allComments.filter(comment => comment.elementId === scene.id && comment.isScene)
        
        return { 
          ...scene, 
          elements: elementsWithComments,
          comments: sceneComments
        }
      } catch (err) {
        console.warn(`Failed to load elements for scene ${scene.id}:`, err)
        return { ...scene, elements: [], comments: [] }
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

// Collaborator functions
export const addCollaborator = async (
  projectId: string,
  email: string,
  role: CollaboratorRole
): Promise<ProjectCollaborator> => {
  const response = await apiClient<{
    id: string
    project_id: string
    user_id: string
    email: string
    role: string
    status: string
    invited_at: string
    joined_at?: string
    message: string
  }>('collaborators', {
    method: 'POST',
    body: {
      project_id: projectId,
      email: email,
      role: role
    }
  })

  return {
    id: response.id,
    name: email.split('@')[0], // Use email prefix as name for now
    email: email,
    usernameWithTag: email,
    role: response.role as CollaboratorRole,
    status: response.status === 'active' ? 'active' : 'pending',
    joinedAt: response.joined_at || response.invited_at,
    userId: response.user_id
  }
}

export const getProjectCollaborators = async (projectId: string): Promise<ProjectCollaborator[]> => {
  const collaborators = await apiClient<Array<{
    id: string
    project_id: string
    user_id: string
    role: string
    status: string
    invited_at: string
    joined_at?: string
  }>>(`collaborators?project_id=${projectId}`, {
    method: 'GET'
  })

  return collaborators.map(collab => ({
    id: collab.id,
    name: `User ${collab.user_id.slice(0, 8)}`, // Placeholder name
    email: `user-${collab.user_id.slice(0, 8)}@example.com`, // Placeholder email
    usernameWithTag: `user-${collab.user_id.slice(0, 8)}`,
    role: collab.role as CollaboratorRole,
    status: collab.status === 'active' ? 'active' : 'pending',
    joinedAt: collab.joined_at || collab.invited_at,
    userId: collab.user_id
  }))
}

export const updateCollaboratorRole = async (
  projectId: string,
  collaboratorId: string,
  role: CollaboratorRole
): Promise<ProjectCollaborator> => {
  const response = await apiClient<{
    id: string
    project_id: string
    user_id: string
    role: string
    status: string
    invited_at: string
    joined_at?: string
  }>(`collaborators/${collaboratorId}`, {
    method: 'PATCH',
    body: {
      role: role
    }
  })

  return {
    id: response.id,
    name: `User ${response.user_id.slice(0, 8)}`,
    email: `user-${response.user_id.slice(0, 8)}@example.com`,
    usernameWithTag: `user-${response.user_id.slice(0, 8)}`,
    role: response.role as CollaboratorRole,
    status: response.status === 'active' ? 'active' : 'pending',
    joinedAt: response.joined_at || response.invited_at,
    userId: response.user_id
  }
}

export const removeCollaborator = async (
  projectId: string,
  collaboratorId: string
): Promise<void> => {
  await apiClient(`collaborators/${collaboratorId}`, {
    method: 'DELETE'
  })
}

export const collaboratorRoleOptions = Object.entries(CollaboratorRoles).map(
  ([key, label]) => ({
    value: key as CollaboratorRole,
    label,
  })
)

// Comment CRUD functions
export const addComment = async (
  projectId: string,
  screenplayId: string,
  content: string,
  lineNumber: number,
  scriptElementId?: string,
  sceneId?: string,
  parentId?: string
): Promise<Comment> => {
  const response = await apiClient<{
    id: string
    project_id: string
    screenplay_id: string
    script_element_id?: string
    scene_id?: string
    user_id: string
    username: string
    content: string
    line_number: number
    char_position: number
    parent_id?: string
    is_resolved: boolean
    created_at: string
    updated_at: string
  }>('comments', {
    method: 'POST',
    body: {
      project_id: projectId,
      screenplay_id: screenplayId,
      content,
      line_number: lineNumber,
      char_position: 0, // Default to 0 for now
      script_element_id: scriptElementId,
      scene_id: sceneId,
      parent_id: parentId
    }
  })

  return {
    id: response.id,
    userName: response.username,
    content: response.content,
    timestamp: response.created_at,
    isResolved: response.is_resolved
  }
}

export const getComments = async (
  screenplayId: string
): Promise<Comment[]> => {
  const response = await apiClient<Array<{
    id: string
    project_id: string
    screenplay_id: string
    script_element_id?: string
    scene_id?: string
    user_id: string
    username: string
    content: string
    line_number: number
    char_position: number
    parent_id?: string
    is_resolved: boolean
    created_at: string
    updated_at: string
  }>>(`comments?screenplay_id=${screenplayId}`, {
    method: 'GET'
  })

  return response.map(comment => ({
    id: comment.id,
    userName: comment.username || `User ${comment.user_id.slice(0, 8)}`,
    content: comment.content,
    timestamp: comment.created_at,
    isResolved: comment.is_resolved,
    elementId: comment.script_element_id || comment.scene_id,
    isScene: !!comment.scene_id // if scene_id exists, it's a scene comment
  }))
}

export const updateComment = async (
  commentId: string,
  content?: string,
  isResolved?: boolean
): Promise<Comment> => {
  const body: any = {}
  if (content !== undefined) body.content = content
  if (isResolved !== undefined) body.is_resolved = isResolved

  const response = await apiClient<{
    id: string
    project_id: string
    screenplay_id: string
    script_element_id?: string
    user_id: string
    content: string
    line_number: number
    char_position: number
    parent_id?: string
    is_resolved: boolean
    created_at: string
    updated_at: string
  }>(`comments/${commentId}`, {
    method: 'PATCH',
    body
  })

  return {
    id: response.id,
    userName: `User ${response.user_id.slice(0, 8)}`,
    content: response.content,
    timestamp: response.created_at,
    isResolved: response.is_resolved
  }
}

export const deleteComment = async (commentId: string): Promise<void> => {
  await apiClient(`comments/${commentId}`, {
    method: 'DELETE'
  })
}

export const toggleCommentResolved = async (commentId: string, newResolvedState: boolean): Promise<Comment> => {
  return updateComment(commentId, undefined, newResolvedState)
}