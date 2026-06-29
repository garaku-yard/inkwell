/**
 * Project service — thin wrappers around the Storage abstraction. Every call
 * routes through `getStorage()` so the desktop (SQLite) and web (gateway)
 * builds can share this file without modification.
 */
import { getStorage } from "@/lib/storage"
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
  | "vault"

export interface Project {
  id: string
  title: string
  description: string
  owner_id: string
  category: ProjectCategory
  status: string
  is_starred: boolean
  collaborator_count?: number
  /** Owning organization; absent for personal projects. */
  org_id?: string
  created_at: string
  updated_at: string
}

export interface CreateProjectRequest {
  title: string
  description?: string
  owner_id: string
  category?: ProjectCategory
  /** When set, the project is created inside this organization. */
  org_id?: string
}

export interface UpdateProjectRequest {
  title?: string
  description?: string
  status?: string
}

export interface ProjectElement {
  id: string
  project_id: string
  scene_id?: string
  element_type: string
  content: string
  line_number: number
  formatting: Record<string, string>
  created_at: string
  updated_at: string
  comments?: Comment[]
}

export interface Scene {
  id: string
  project_id: string
  outline_unit_id?: string
  scene_heading: string
  content: string
  order_index: number
  elements?: ProjectElement[]
  created_at: string
  updated_at: string
  comments?: Comment[]
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
  elementId?: string
  isScene?: boolean
}

// ─── Projects ─────────────────────────────────────────────────────────────

export const createProject = (projectData: CreateProjectRequest): Promise<Project> =>
  getStorage().projects.create(projectData)

export const getProjectById = (projectId: string, userId: string): Promise<Project> =>
  getStorage().projects.getById(projectId, userId)

export const getSharedProjects = (): Promise<Project[]> =>
  getStorage().projects.listShared()

export const getMyProjects = (
  userId: string,
): Promise<{ projects: (Project & { collaborator_count?: number })[]; total: number }> =>
  getStorage().projects.listOwned(userId)

export const updateProject = (
  projectId: string,
  userId: string,
  projectData: UpdateProjectRequest,
): Promise<Project> => getStorage().projects.update(projectId, userId, projectData)

export const toggleProjectStar = (projectId: string, userId: string): Promise<Project> =>
  getStorage().projects.toggleStar(projectId, userId)

/** Archive flag piggybacks on the project status field — no schema
 *  change needed. "archived" hides the project from default
 *  dashboard views; any other status (typically "active" or "draft")
 *  shows it. */
export const setProjectArchived = (
  projectId: string,
  userId: string,
  archived: boolean,
): Promise<Project> =>
  getStorage().projects.update(projectId, userId, {
    status: archived ? "archived" : "active",
  })

export const deleteProject = (projectId: string, userId: string): Promise<void> =>
  getStorage().projects.delete(projectId, userId)

export const getFullProject = (projectId: string, userId: string): Promise<FullProject> =>
  getStorage().projects.getFull(projectId, userId)

// ─── Scenes ───────────────────────────────────────────────────────────────

export const createScene = (
  projectId: string,
  userId: string,
  sceneData: {
    scene_heading: string
    content?: string
    outline_unit_id?: string
    order_index?: number
  },
): Promise<Scene> => getStorage().scenes.create(projectId, userId, sceneData)

export const getProjectScenes = (projectId: string, userId: string): Promise<Scene[]> =>
  getStorage().scenes.listForProject(projectId, userId)

export const updateSceneHeading = (
  sceneId: string,
  userId: string,
  sceneHeading: string,
): Promise<Scene> => getStorage().scenes.updateHeading(sceneId, userId, sceneHeading)

// ─── Elements ─────────────────────────────────────────────────────────────

// The legacy createElement signature takes a free-form scene id + element
// fields. It's kept because a few callers still prefer it; under the hood it
// forwards to the Storage interface's element-create method, which expects
// the editor-style `CreateElementRequest`.
export const createElement = (
  projectId: string,
  _userId: string,
  elementData: {
    scene_id: string
    element_type: string
    content: string
    line_number?: number
    formatting?: Record<string, string>
  },
): Promise<ProjectElement> =>
  getStorage().elements.create({
    projectId,
    sceneId: elementData.scene_id,
    elementOrder: elementData.line_number ?? 0,
    elementType: elementData.element_type,
    content: elementData.content,
  })

export const updateElementContent = (
  elementId: string,
  _userId: string,
  content: string,
): Promise<ProjectElement> => getStorage().elements.update(elementId, { content })

export const createSceneElement = (
  projectId: string,
  sceneId: string,
  userId: string,
  elementData: {
    element_type: string
    content: string
    order_index?: number
  },
): Promise<ProjectElement> =>
  createElement(projectId, userId, {
    scene_id: sceneId,
    element_type: elementData.element_type,
    content: elementData.content,
    line_number: elementData.order_index ?? 0,
  })

// ─── Characters / locations ──────────────────────────────────────────────

export const createCharacter = (
  projectId: string,
  userId: string,
  characterData: {
    name: string
    description?: string
    role?: string
    attributes?: Record<string, string>
  },
): Promise<Character> => getStorage().characters.create(projectId, userId, characterData)

export const getProjectCharacters = (
  projectId: string,
  userId: string,
): Promise<Character[]> => getStorage().characters.listForProject(projectId, userId)

export const createLocation = (
  projectId: string,
  userId: string,
  locationData: {
    name: string
    description?: string
    type?: string
  },
): Promise<Location> => getStorage().locations.create(projectId, userId, locationData)

export const getProjectLocations = (
  projectId: string,
  userId: string,
): Promise<Location[]> => getStorage().locations.listForProject(projectId, userId)

// ─── Collaboration ────────────────────────────────────────────────────────

export const addCollaborator = (
  projectId: string,
  email: string,
  role: CollaboratorRole,
): Promise<ProjectCollaborator> =>
  getStorage().collaboration.addCollaborator(projectId, email, role)

export const getProjectCollaborators = (
  projectId: string,
): Promise<ProjectCollaborator[]> => getStorage().collaboration.listCollaborators(projectId)

export const updateCollaboratorRole = (
  collaboratorId: string,
  role: CollaboratorRole,
): Promise<ProjectCollaborator> =>
  getStorage().collaboration.updateCollaboratorRole(collaboratorId, role)

export const removeCollaborator = (collaboratorId: string): Promise<void> =>
  getStorage().collaboration.removeCollaborator(collaboratorId)

export const collaboratorRoleOptions = Object.entries(CollaboratorRoles).map(
  ([key, label]) => ({ value: key as CollaboratorRole, label }),
)

// ─── Comments ─────────────────────────────────────────────────────────────

export const addComment = (
  projectId: string,
  screenplayId: string,
  content: string,
  lineNumber: number,
  scriptElementId?: string,
  sceneId?: string,
  parentId?: string,
): Promise<Comment> =>
  getStorage().collaboration.addComment({
    projectId,
    screenplayId,
    content,
    lineNumber,
    scriptElementId,
    sceneId,
    parentId,
  })

export const getComments = (screenplayId: string): Promise<Comment[]> =>
  getStorage().collaboration.listComments(screenplayId)

export const updateComment = (
  commentId: string,
  content?: string,
  isResolved?: boolean,
): Promise<Comment> =>
  getStorage().collaboration.updateComment(commentId, { content, isResolved })

export const deleteComment = (commentId: string): Promise<void> =>
  getStorage().collaboration.deleteComment(commentId)

export const toggleCommentResolved = (
  commentId: string,
  newResolvedState: boolean,
): Promise<Comment> => updateComment(commentId, undefined, newResolvedState)
