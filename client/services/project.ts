/**
 * Project service — CRUD for projects, scenes, script elements, characters,
 * locations, beats, and collaborators.
 */
import { apiClient } from "@/lib/api"
import { type CollaboratorRole, CollaboratorRoles } from "@/models/constants/collaboratorRoles"

export type ProjectCategory =
  | "screenplay"
  | "novel"
  | "comic_script"
  | "poetry"
  | "interactive_fiction"
  | "tabletop_rpg"
  | "memoir"
  | "lyrics"

/** A writing project. */
export interface Project {
  /** UUID of the project. */
  id: string;
  /** Display title of the project. */
  title: string;
  /** Optional long-form description or logline. */
  description: string;
  /** UUID of the user who created the project. */
  owner_id: string;
  /** Content type that determines which editor is shown. */
  category: ProjectCategory;
  /** Workflow status (e.g. `"draft"`, `"in_progress"`, `"complete"`). */
  status: string;
  /** Whether the authenticated user has starred this project. */
  is_starred: boolean;
  /** Number of active and pending collaborators. Populated by the gateway fan-out. */
  collaborator_count?: number;
  /** ISO 8601 timestamp of project creation. */
  created_at: string;
  /** ISO 8601 timestamp of the most recent update. */
  updated_at: string;
}

/** Payload for creating a new project. */
export interface CreateProjectRequest {
  /** Title of the project (required). */
  title: string;
  /** Optional description or logline. */
  description?: string;
  /** UUID of the owning user. */
  owner_id: string;
  /** Content category; defaults to `"screenplay"` when omitted. */
  category?: ProjectCategory;
}

/** Fields that may be changed when updating a project. */
export interface UpdateProjectRequest {
  /** New project title. */
  title?: string;
  /** New description. */
  description?: string;
  /** New workflow status. */
  status?: string;
}

/** A single typed line in a screenplay scene (action, dialogue, cue, etc.). */
export interface ScriptElement {
  /** UUID of the element. */
  id: string;
  /** UUID of the parent project. */
  project_id: string;
  /** UUID of the scene this element belongs to, if any. */
  scene_id?: string;
  /** Element type string (e.g. `"ACTION"`, `"CHARACTER"`, `"DIALOG"`). */
  element_type: string;
  /** Text content of the element. */
  content: string;
  /** UUID of the character associated with dialogue elements. */
  character_id?: string;
  /** 1-based line number within the scene. */
  line_number: number;
  /** Arbitrary formatting metadata (e.g. bold, italic spans). */
  formatting: Record<string, string>;
  /** ISO 8601 timestamp of element creation. */
  created_at: string;
  /** ISO 8601 timestamp of the most recent update. */
  updated_at: string;
  /** Comments attached to this element, if eagerly loaded. */
  comments?: Comment[];
}

/** A scene within a project, containing an ordered list of script elements. */
export interface Scene {
  /** UUID of the scene. */
  id: string;
  /** UUID of the parent project. */
  project_id: string;
  /** UUID of the beat-board outline unit this scene is linked to, if any. */
  outline_unit_id?: string;
  /** Slug line heading (e.g. `"INT. COFFEE SHOP - DAY"`). */
  scene_heading: string;
  /** Free-form scene notes or summary (separate from the element list). */
  content: string;
  /** 0-based position of this scene in the project's scene list. */
  order_index: number;
  /** Script elements belonging to this scene, if eagerly loaded. */
  elements?: ScriptElement[];
  /** ISO 8601 timestamp of scene creation. */
  created_at: string;
  /** ISO 8601 timestamp of the most recent update. */
  updated_at: string;
  /** Comments attached to this scene, if eagerly loaded. */
  comments?: Comment[];
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
  unit_type: string
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

/** A user who has been invited to or has joined a project. */
export interface ProjectCollaborator {
  /** UUID of the collaboration record. */
  id: string;
  /** Display name of the collaborator. */
  name: string;
  /** Email address of the collaborator. */
  email: string;
  /** Username combined with its discriminator tag (e.g. `"alice#1234"`). */
  usernameWithTag: string;
  /** Optional URL to the collaborator's avatar image. */
  avatar?: string;
  /** Access level granted to this collaborator. */
  role: CollaboratorRole;
  /** `"active"` once the invitation has been accepted; `"pending"` otherwise. */
  status: "active" | "pending";
  /** ISO 8601 timestamp of when the user accepted the invitation. */
  joinedAt: string;
  /** UUID of the collaborator's user account. */
  userId: string;
}

/** An inline comment attached to a script element or scene. */
export interface Comment {
  /** UUID of the comment. */
  id: string;
  /** Display name of the user who wrote the comment. */
  userName: string;
  /** Text body of the comment. */
  content: string;
  /** ISO 8601 timestamp of when the comment was created. */
  timestamp: string;
  /** Whether the comment thread has been marked resolved. */
  isResolved: boolean;
  /** UUID of the script element or scene this comment is attached to. */
  elementId?: string;
  /** `true` when `elementId` refers to a scene rather than a script element. */
  isScene?: boolean;
}

// --- Service Functions ---

/**
 * Creates a new writing project. The owner is automatically added as an active
 * collaborator by the gateway after creation.
 *
 * @param projectData - Title, owner ID, and optional description and category.
 * @returns A promise that resolves to the newly created project.
 * @throws {Error} When required fields are missing or the user is not authenticated.
 *
 * @example
 * ```ts
 * const project = await createProject({ title: "My Screenplay", owner_id: userId, category: "screenplay" });
 * ```
 */
export const createProject = async (projectData: CreateProjectRequest): Promise<Project> => {
  const response = await apiClient<{ project: Project }>('projects', {
    method: 'POST',
    body: projectData,
  })
  return response.project
}

/**
 * Fetches a single project by its UUID. The server enforces that `userId` is
 * the project owner; collaborator access is handled separately via `getSharedProjects`.
 *
 * @param projectId - UUID of the project to retrieve.
 * @param userId - UUID of the requesting user (used for ownership check).
 * @returns A promise that resolves to the project.
 * @throws {Error} When the project is not found or the user is not the owner.
 */
export const getProjectById = async (projectId: string, userId: string): Promise<Project> => {
  const response = await apiClient<{ project: Project }>(`projects/${projectId}?user_id=${userId}`, {
    method: 'GET',
  })
  return response.project
}

/**
 * Fetches projects where the authenticated user is an active collaborator but
 * not the owner. The gateway skips the ownership check for these because
 * collaborator membership has already been verified server-side.
 *
 * @returns A promise that resolves to the list of shared projects.
 * @throws {Error} When the user is not authenticated.
 */
export const getSharedProjects = async (): Promise<Project[]> => {
  const response = await apiClient<{ projects: Project[] }>(`projects/shared`, { method: 'GET' })
  return response.projects ?? []
}

/**
 * Fetches all projects owned by the user, including their collaborator counts.
 * The gateway resolves collaborator counts in parallel server-side to avoid
 * N+1 round-trips from the client.
 *
 * @param userId - UUID of the project owner.
 * @returns A promise that resolves to the project list and total count.
 * @throws {Error} When the user is not authenticated.
 *
 * @example
 * ```ts
 * const { projects, total } = await getMyProjects(userId);
 * ```
 */
export const getMyProjects = async (userId: string): Promise<{ projects: (Project & { collaborator_count?: number })[], total: number }> => {
  // collaborator_count is included in each project by the gateway (fetched in parallel server-side)
  const response = await apiClient<{ projects: (Project & { collaborator_count?: number })[], pagination?: { total_items: number } }>(`projects?user_id=${userId}`, {
    method: 'GET',
  })
  return {
    projects: response.projects,
    total: response.pagination?.total_items ?? response.projects.length
  }
}

/**
 * Applies partial updates to a project's title, description, or status.
 *
 * @param projectId - UUID of the project to update.
 * @param userId - UUID of the requesting user (must be the project owner).
 * @param projectData - Fields to update; omitted fields are left unchanged.
 * @returns A promise that resolves to the updated project.
 * @throws {Error} When the project is not found or the caller is not the owner.
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
 * Toggles the starred status of a project for the given user. Returns the
 * updated project so the caller can reflect the new state without a second fetch.
 *
 * @param projectId - UUID of the project.
 * @param userId - UUID of the user toggling the star.
 * @returns A promise that resolves to the project with the updated `is_starred` value.
 */
export const toggleProjectStar = async (projectId: string, userId: string): Promise<Project> => {
  const response = await apiClient<{ project: Project }>(`projects/${projectId}/star`, {
    method: 'PATCH',
    body: { user_id: userId }
  })
  return response.project
}

/**
 * Permanently deletes a project and all its scenes, elements, and collaborators.
 *
 * @param projectId - UUID of the project to delete.
 * @param userId - UUID of the requesting user (must be the project owner).
 * @returns A promise that resolves when the deletion is complete.
 * @throws {Error} When the caller is not the project owner.
 */
export const deleteProject = async (projectId: string, userId: string): Promise<void> => {
  return apiClient<void>(`projects/${projectId}`, {
    method: 'DELETE',
    body: { user_id: userId },
  })
}

/**
 * Fetches a project together with all its scenes, script elements, and comments
 * in a single logical call. Elements are fetched per-scene in parallel. If any
 * scene's elements fail to load, that scene is returned with an empty element list
 * and a console warning rather than rejecting the whole promise.
 *
 * @param projectId - UUID of the project to load.
 * @param userId - UUID of the requesting user.
 * @returns A promise that resolves to the project with nested scenes and elements.
 *
 * @example
 * ```ts
 * const project = await getFullProject(projectId, userId);
 * project.scenes?.forEach(scene => console.log(scene.elements?.length));
 * ```
 */
export const getFullProject = async (projectId: string, userId: string): Promise<FullProject> => {
  const projectResponse = await apiClient<{ project: Project }>(`projects/${projectId}?user_id=${userId}`, {
    method: 'GET',
  })

  const scenes = await getProjectScenes(projectId, userId)

  const allComments = await getComments(projectId)

  const scenesWithElements = await Promise.all(
    scenes.map(async (scene) => {
      try {
        const elements = await getSceneElements(scene.id, userId)

        const elementsWithComments = elements.map(element => ({
          ...element,
          comments: allComments.filter(comment => comment.elementId === element.id && !comment.isScene)
        }))

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

/**
 * Creates a new scene within a project.
 *
 * @param projectId - UUID of the parent project.
 * @param userId - UUID of the requesting user (must have write access).
 * @param sceneData - Scene heading and optional content, outline link, and position.
 * @returns A promise that resolves to the newly created scene.
 */
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

/**
 * Fetches all scenes for a project, ordered by `order_index`.
 *
 * @param projectId - UUID of the project.
 * @param userId - UUID of the requesting user.
 * @returns A promise that resolves to the ordered list of scenes.
 */
export const getProjectScenes = async (projectId: string, userId: string): Promise<Scene[]> => {
  const response = await apiClient<{ scenes: Scene[] }>(`scenes?project_id=${projectId}&user_id=${userId}`, {
    method: 'GET',
  })
  return response.scenes
}

/**
 * Updates the slug-line heading of an existing scene.
 *
 * @param sceneId - UUID of the scene to update.
 * @param userId - UUID of the requesting user (must have write access).
 * @param sceneHeading - New heading text (e.g. `"EXT. PARK - NIGHT"`).
 * @returns A promise that resolves to the updated scene.
 */
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

/**
 * Creates a single script element within a scene.
 *
 * @param projectId - UUID of the parent project.
 * @param userId - UUID of the requesting user.
 * @param elementData - Element type, content, scene ID, and optional character
 *   link and formatting map.
 * @returns A promise that resolves to the newly created script element.
 */
export const createElement = async (
  projectId: string,
  userId: string,
  elementData: {
    scene_id: string
    element_type: string
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

/**
 * Replaces the text content of a script element. Only the `content` field is
 * updated; element type and position are unchanged.
 *
 * @param elementId - UUID of the element to update.
 * @param userId - UUID of the requesting user.
 * @param content - New text content.
 * @returns A promise that resolves to the updated script element.
 */
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

/**
 * Fetches all script elements for a scene, ordered by `line_number`.
 *
 * @param sceneId - UUID of the scene.
 * @param userId - UUID of the requesting user.
 * @returns A promise that resolves to the ordered list of script elements.
 */
export const getSceneElements = async (sceneId: string, userId: string): Promise<ScriptElement[]> => {
  const response = await apiClient<{ elements: ScriptElement[] }>(`elements?scene_id=${sceneId}&user_id=${userId}`, {
    method: 'GET',
  })
  return response.elements
}

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

export const createScriptElement = async (
  projectId: string,
  userId: string,
  elementData: {
    scene_id: string
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

/**
 * Invites a user to collaborate on a project by email address. The server sends
 * an invitation; the collaborator's status is `"pending"` until they accept.
 * Only `"editor"` and `"viewer"` roles may be granted — the `"owner"` role
 * cannot be assigned through this endpoint.
 *
 * @param projectId - UUID of the project to invite the user to.
 * @param email - Email address of the person to invite.
 * @param role - Access level to grant (`"editor"` or `"viewer"`).
 * @returns A promise that resolves to the new collaborator record.
 * @throws {Error} When the email is already an active or pending collaborator.
 *
 * @example
 * ```ts
 * const collab = await addCollaborator(projectId, "bob@example.com", "editor");
 * console.log(collab.status); // "pending"
 * ```
 */
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
    name: email.split('@')[0],
    email: email,
    usernameWithTag: email,
    role: response.role as CollaboratorRole,
    status: response.status === 'active' ? 'active' : 'pending',
    joinedAt: response.joined_at || response.invited_at,
    userId: response.user_id
  }
}

/**
 * Fetches all active and pending collaborators for a project. The gateway
 * enriches each record with the user's display name and username tag by
 * querying the identity service.
 *
 * @param projectId - UUID of the project.
 * @returns A promise that resolves to the list of collaborator records.
 */
export const getProjectCollaborators = async (projectId: string): Promise<ProjectCollaborator[]> => {
  const collaborators = await apiClient<Array<{
    id: string
    project_id: string
    user_id: string
    name?: string
    email?: string
    username_with_tag?: string
    role: string
    status: string
    invited_at: string
    joined_at?: string
  }>>(`collaborators?project_id=${projectId}`, {
    method: 'GET'
  })

  return collaborators.map(collab => ({
    id: collab.id,
    email: (collab.email || '').trim() || `user-${collab.user_id.slice(0, 8)}@example.com`,
    name: (collab.name || '').trim() || (collab.email ? collab.email.split('@')[0] : `User ${collab.user_id.slice(0, 8)}`),
    usernameWithTag: (collab.username_with_tag || '').trim() || (collab.email ? collab.email.split('@')[0] : `user-${collab.user_id.slice(0, 8)}`),
    role: collab.role as CollaboratorRole,
    status: collab.status === 'active' ? 'active' : 'pending',
    joinedAt: collab.joined_at || collab.invited_at,
    userId: collab.user_id
  }))
}

/**
 * Changes the role of an existing project collaborator.
 *
 * @param collaboratorId - UUID of the collaboration record.
 * @param role - New role to assign.
 * @returns A promise that resolves to the updated collaborator record.
 */
export const updateCollaboratorRole = async (
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

/**
 * Removes a collaborator from a project.
 *
 * @param collaboratorId - UUID of the collaboration record to remove.
 * @returns A promise that resolves when the collaborator has been removed.
 */
export const removeCollaborator = async (
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

/**
 * Posts a new comment on a script element or scene. `screenplay_id` maps to
 * the project ID in the collab service schema.
 *
 * @param projectId - UUID of the project (used for access control).
 * @param screenplayId - UUID passed as `screenplay_id` to the collab service.
 * @param content - Text body of the comment.
 * @param lineNumber - 1-based line number within the script where the comment anchors.
 * @param scriptElementId - UUID of the script element being commented on, if any.
 * @param sceneId - UUID of the scene being commented on, if any.
 * @param parentId - UUID of a parent comment for threaded replies, if any.
 * @returns A promise that resolves to the newly created comment.
 *
 * @example
 * ```ts
 * const comment = await addComment(projectId, projectId, "Great action line!", 42, elementId);
 * ```
 */
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
      char_position: 0,
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

/**
 * Fetches all comments for a project. The collab service uses `screenplay_id`
 * as an alias for the project ID. Each comment is enriched with `elementId` and
 * `isScene` so callers can attach it to the correct UI target.
 *
 * @param screenplayId - UUID of the project (passed as `screenplay_id`).
 * @returns A promise that resolves to the list of comments.
 */
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
    isScene: !!comment.scene_id
  }))
}

/**
 * Applies partial updates to a comment's text or resolved state. Only fields
 * that are passed (non-`undefined`) are included in the PATCH body.
 *
 * @param commentId - UUID of the comment to update.
 * @param content - New text content, if changing.
 * @param isResolved - New resolved state, if changing.
 * @returns A promise that resolves to the updated comment.
 */
export const updateComment = async (
  commentId: string,
  content?: string,
  isResolved?: boolean
): Promise<Comment> => {
  const body: { content?: string; is_resolved?: boolean } = {}
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

/**
 * Permanently deletes a comment.
 *
 * @param commentId - UUID of the comment to delete.
 * @returns A promise that resolves when the deletion is complete.
 */
export const deleteComment = async (commentId: string): Promise<void> => {
  await apiClient(`comments/${commentId}`, {
    method: 'DELETE'
  })
}

/**
 * Sets a comment's resolved state. Delegates to `updateComment` with only the
 * `isResolved` field set.
 *
 * @param commentId - UUID of the comment to update.
 * @param newResolvedState - `true` to mark resolved, `false` to reopen.
 * @returns A promise that resolves to the updated comment.
 */
export const toggleCommentResolved = async (commentId: string, newResolvedState: boolean): Promise<Comment> => {
  return updateComment(commentId, undefined, newResolvedState)
}

/**
 * Generic element creator used by non-screenplay editors (prose, poetry, comic
 * script, interactive fiction, TTRPG). Delegates to `createElement` with
 * `order_index` mapped to `line_number`.
 *
 * @param projectId - UUID of the parent project.
 * @param sceneId - UUID of the scene to add the element to.
 * @param userId - UUID of the requesting user.
 * @param elementData - Element type, content, and optional insertion index.
 * @returns A promise that resolves to the newly created script element.
 */
export const createSceneElement = async (
  projectId: string,
  sceneId: string,
  userId: string,
  elementData: {
    element_type: string
    content: string
    order_index?: number
  }
): Promise<ScriptElement> => {
  return createElement(projectId, userId, {
    scene_id: sceneId,
    element_type: elementData.element_type,
    content: elementData.content,
    line_number: elementData.order_index ?? 0,
  })
}
