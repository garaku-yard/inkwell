/**
 * Remote Storage implementation — every method talks to the Go gateway via
 * `apiClient` / `apiStreamClient`. This file owns all of the HTTP wire
 * formatting and response-shape mapping; `services/*` files will delegate to
 * the Storage interface rather than call `apiClient` themselves, so a local
 * (SQLite) implementation can drop in without every callsite being aware.
 */

import { apiClient, apiStreamClient } from "@/lib/api"
import { type CollaboratorRole } from "@/models/constants/collaboratorRoles"

import type {
  AdminBillingStorage,
  AiStorage,
  AuthStorage,
  AuthResponse,
  BeatBoardStorage,
  BeatBoardData,
  BillingAnalytics,
  Capability,
  Category,
  Character,
  CharacterStorage,
  CollaborationStorage,
  Comment,
  CurrentUser,
  ElementStorage,
  FullProject,
  GatewayConfig,
  Invitation,
  Location,
  LocationStorage,
  PaymentGateway,
  Project,
  ProjectCollaborator,
  ProjectStorage,
  Scene,
  SceneStorage,
  ScriptElement,
  SettingsStorage,
  Storage,
  SubscriptionTier,
  UsageMetrics,
  UserSubscription,
  Workspace,
  WorkspaceMember,
  WorkspacesResponse,
  BillingAuditLog,
  DataDeletionRequest,
  UpdateProfileResponse,
  AIProvidersResponse,
  AIChatRequest,
  Beat,
  Connection,
  Lane,
  OutlineItem,
  CreateTierInput,
} from "./index"

// The remote build exposes every capability the gateway supports.
const REMOTE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "auth",
  "collaboration",
  "realtime",
  "admin",
  "ai.hosted",
])

// ─── Auth ─────────────────────────────────────────────────────────────────

const auth: AuthStorage = {
  login: async (credentials) =>
    apiClient<AuthResponse>("api/v1/login", { method: "POST", body: credentials }),

  register: async (payload) =>
    apiClient<AuthResponse>("api/v1/register", { method: "POST", body: payload }),

  logout: async () => {
    await apiClient<void>("api/v1/logout", { method: "POST" })
  },

  me: async () => {
    try {
      const data = await apiClient<{
        user: {
          id: string
          email: string
          username: string
          usernameTag: string
          name: string
          lastName: string
          role?: string
        }
      }>("api/v1/users/me", { method: "GET" })
      const u = data.user
      const out: CurrentUser = {
        id: u.id,
        email: u.email,
        username: u.username,
        tag: u.usernameTag,
        role: u.role ?? "user",
        name: u.name ?? "",
        lastName: u.lastName ?? "",
      }
      return out
    } catch {
      return null
    }
  },
}

// ─── Projects ─────────────────────────────────────────────────────────────

const projects: ProjectStorage = {
  create: async (input) => {
    const response = await apiClient<{ project: Project }>("projects", {
      method: "POST",
      body: input,
    })
    return response.project
  },

  getById: async (projectId, userId) => {
    const response = await apiClient<{ project: Project }>(
      `projects/${projectId}?user_id=${userId}`,
      { method: "GET" },
    )
    return response.project
  },

  getFull: async (projectId, userId) => {
    const projectResponse = await apiClient<{ project: Project }>(
      `projects/${projectId}?user_id=${userId}`,
      { method: "GET" },
    )

    const scenes = await projectsHelpers.listSceneArray(projectId, userId)
    const allComments = await projectsHelpers.listCommentArray(projectId)

    const scenesWithElements = await Promise.all(
      scenes.map(async (scene) => {
        try {
          const elements = await projectsHelpers.listElementsForScene(scene.id, userId)
          const elementsWithComments = elements.map((el) => ({
            ...el,
            comments: allComments.filter(
              (c) => c.elementId === el.id && !c.isScene,
            ),
          }))
          const sceneComments = allComments.filter(
            (c) => c.elementId === scene.id && c.isScene,
          )
          return { ...scene, elements: elementsWithComments, comments: sceneComments }
        } catch (err) {
          console.warn(`Failed to load elements for scene ${scene.id}:`, err)
          return { ...scene, elements: [], comments: [] }
        }
      }),
    )

    const full: FullProject = { ...projectResponse.project, scenes: scenesWithElements }
    return full
  },

  listOwned: async (userId) => {
    const response = await apiClient<{
      projects: (Project & { collaborator_count?: number })[]
      pagination?: { total_items: number }
    }>(`projects?user_id=${userId}`, { method: "GET" })
    return {
      projects: response.projects,
      total: response.pagination?.total_items ?? response.projects.length,
    }
  },

  listShared: async () => {
    const response = await apiClient<{ projects: Project[] }>("projects/shared", {
      method: "GET",
    })
    return response.projects ?? []
  },

  update: async (projectId, userId, patch) => {
    const response = await apiClient<{ project: Project }>(`projects/${projectId}`, {
      method: "PUT",
      body: { ...patch, user_id: userId },
    })
    return response.project
  },

  toggleStar: async (projectId, userId) => {
    const response = await apiClient<{ project: Project }>(
      `projects/${projectId}/star`,
      { method: "PATCH", body: { user_id: userId } },
    )
    return response.project
  },

  delete: async (projectId, userId) => {
    await apiClient<void>(`projects/${projectId}`, {
      method: "DELETE",
      body: { user_id: userId },
    })
  },
}

// Helpers reused by getFull. Defined outside the struct so nested method
// references don't get tripped up by the interface typing.
const projectsHelpers = {
  async listSceneArray(projectId: string, userId: string): Promise<Scene[]> {
    const response = await apiClient<{ scenes: Scene[] }>(
      `scenes?project_id=${projectId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.scenes
  },

  async listCommentArray(screenplayId: string): Promise<Comment[]> {
    const response = await apiClient<Array<{
      id: string
      script_element_id?: string
      scene_id?: string
      user_id: string
      username: string
      content: string
      is_resolved: boolean
      created_at: string
    }>>(`comments?screenplay_id=${screenplayId}`, { method: "GET" })
    return response.map((c) => ({
      id: c.id,
      userName: c.username || `User ${c.user_id.slice(0, 8)}`,
      content: c.content,
      timestamp: c.created_at,
      isResolved: c.is_resolved,
      elementId: c.script_element_id || c.scene_id,
      isScene: !!c.scene_id,
    }))
  },

  async listElementsForScene(sceneId: string, userId: string): Promise<ScriptElement[]> {
    const response = await apiClient<{ elements: ScriptElement[] }>(
      `elements?scene_id=${sceneId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.elements
  },
}

// ─── Scenes ───────────────────────────────────────────────────────────────

const scenes: SceneStorage = {
  create: async (projectId, userId, input) => {
    const response = await apiClient<{ scene: Scene }>("scenes", {
      method: "POST",
      body: { project_id: projectId, user_id: userId, ...input },
    })
    return response.scene
  },

  listForProject: (projectId, userId) => projectsHelpers.listSceneArray(projectId, userId),

  updateHeading: async (sceneId, userId, heading) => {
    const response = await apiClient<{ scene: Scene }>(`scenes/${sceneId}`, {
      method: "PUT",
      body: { user_id: userId, scene_heading: heading },
    })
    return response.scene
  },

  delete: async (sceneId) => {
    await apiClient<void>(`scenes/${sceneId}`, { method: "DELETE" })
  },
}

// ─── Elements ─────────────────────────────────────────────────────────────

const elements: ElementStorage = {
  create: async (input) =>
    apiClient<ScriptElement>(`scenes/${input.sceneId}/elements`, {
      method: "POST",
      body: input,
    }),

  listForScene: (sceneId, userId) => projectsHelpers.listElementsForScene(sceneId, userId),

  update: async (elementId, patch) =>
    apiClient<ScriptElement>(`elements/${elementId}`, {
      method: "PATCH",
      body: patch,
    }),

  delete: async (elementId) => {
    await apiClient<void>(`elements/${elementId}`, { method: "DELETE" })
  },

  listForProject: async (projectId, userId, startLine, endLine) => {
    let url = `script-elements?project_id=${projectId}&user_id=${userId}`
    if (startLine !== undefined) url += `&start_line=${startLine}`
    if (endLine !== undefined) url += `&end_line=${endLine}`
    const response = await apiClient<{ script_elements: ScriptElement[] }>(url, {
      method: "GET",
    })
    return response.script_elements
  },
}

// ─── Characters / locations ──────────────────────────────────────────────

const characters: CharacterStorage = {
  create: async (projectId, userId, input) => {
    const response = await apiClient<{ character: Character }>("characters", {
      method: "POST",
      body: { project_id: projectId, user_id: userId, ...input },
    })
    return response.character
  },

  listForProject: async (projectId, userId) => {
    const response = await apiClient<{ characters: Character[] }>(
      `characters?project_id=${projectId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.characters
  },
}

const locations: LocationStorage = {
  create: async (projectId, userId, input) => {
    const response = await apiClient<{ location: Location }>("locations", {
      method: "POST",
      body: { project_id: projectId, user_id: userId, ...input },
    })
    return response.location
  },

  listForProject: async (projectId, userId) => {
    const response = await apiClient<{ locations: Location[] }>(
      `locations?project_id=${projectId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.locations
  },
}

// ─── Beat board ───────────────────────────────────────────────────────────

const beatBoard: BeatBoardStorage = {
  getBoard: (projectId) =>
    apiClient<BeatBoardData>(`projects/${projectId}/beat-board`),

  createBeat: (projectId, input) =>
    apiClient<Beat>(`projects/${projectId}/beats`, { method: "POST", body: input }),
  updateBeat: (beatId, patch) =>
    apiClient<Beat>(`beats/${beatId}`, { method: "PATCH", body: patch }),
  deleteBeat: async (beatId) => {
    await apiClient<void>(`beats/${beatId}`, { method: "DELETE" })
  },

  createConnection: (projectId, input) =>
    apiClient<Connection>(`projects/${projectId}/connections`, {
      method: "POST",
      body: input,
    }),
  deleteConnection: async (connectionId) => {
    await apiClient<void>(`connections/${connectionId}`, { method: "DELETE" })
  },

  createLane: (projectId, input) =>
    apiClient<Lane>(`projects/${projectId}/lanes`, { method: "POST", body: input }),
  updateLane: async (laneId, patch) => {
    await apiClient<void>(`lanes/${laneId}`, { method: "PATCH", body: patch })
  },
  updateLaneOrder: async (projectId, orderedIds) => {
    await apiClient<void>(`projects/${projectId}/lanes/order`, {
      method: "PATCH",
      body: { orderedIds },
    })
  },

  createOutlineItem: (projectId, input) =>
    apiClient<OutlineItem>(`projects/${projectId}/beat-board/outline-items`, {
      method: "POST",
      body: input,
    }),
  updateOutlineItem: async (itemId, patch) => {
    await apiClient<void>(`outline-items/${itemId}`, { method: "PATCH", body: patch })
  },
  deleteOutlineItem: async (itemId) => {
    await apiClient<void>(`outline-items/${itemId}`, { method: "DELETE" })
  },
}

// ─── Workspaces ───────────────────────────────────────────────────────────

const workspaces = {
  listCategories: () => apiClient<Category[]>("categories"),
  list: () => apiClient<WorkspacesResponse>("workspaces"),
  createPersonal: (_userId: string, categorySlugs: string[]) =>
    apiClient<{ workspaces: Workspace[] }>("workspaces/personal", {
      method: "POST",
      body: { category_slugs: categorySlugs },
    }),
  createOrg: (input: { name: string; description?: string; category_slugs?: string[] }) =>
    apiClient<Workspace>("workspaces/org", {
      method: "POST",
      body: {
        name: input.name,
        description: input.description,
        category_slugs: input.category_slugs ?? [],
      },
    }),
  get: (workspaceId: string) => apiClient<Workspace>(`workspaces/${workspaceId}`),
  update: (
    workspaceId: string,
    patch: { name?: string; description?: string; avatar_url?: string },
  ) =>
    apiClient<Workspace>(`workspaces/${workspaceId}`, {
      method: "PATCH",
      body: patch,
    }),
  delete: async (workspaceId: string) => {
    await apiClient<void>(`workspaces/${workspaceId}`, { method: "DELETE" })
  },
  enableCategory: (workspaceId: string, slug: string) =>
    apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, {
      method: "POST",
    }),
  disableCategory: (workspaceId: string, slug: string) =>
    apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, {
      method: "DELETE",
    }),
}

// ─── Collaboration ────────────────────────────────────────────────────────

const collaboration: CollaborationStorage = {
  addCollaborator: async (projectId, email, role) => {
    const response = await apiClient<{
      id: string
      user_id: string
      role: string
      status: string
      invited_at: string
      joined_at?: string
    }>("collaborators", {
      method: "POST",
      body: { project_id: projectId, email, role },
    })
    const collab: ProjectCollaborator = {
      id: response.id,
      name: email.split("@")[0],
      email,
      usernameWithTag: email,
      role: response.role as CollaboratorRole,
      status: response.status === "active" ? "active" : "pending",
      joinedAt: response.joined_at || response.invited_at,
      userId: response.user_id,
    }
    return collab
  },

  listCollaborators: async (projectId) => {
    const rows = await apiClient<Array<{
      id: string
      user_id: string
      name?: string
      email?: string
      username_with_tag?: string
      role: string
      status: string
      invited_at: string
      joined_at?: string
    }>>(`collaborators?project_id=${projectId}`, { method: "GET" })
    return rows.map((r) => ({
      id: r.id,
      email: (r.email || "").trim() || `user-${r.user_id.slice(0, 8)}@example.com`,
      name: (r.name || "").trim() || (r.email ? r.email.split("@")[0] : `User ${r.user_id.slice(0, 8)}`),
      usernameWithTag: (r.username_with_tag || "").trim() || (r.email ? r.email.split("@")[0] : `user-${r.user_id.slice(0, 8)}`),
      role: r.role as CollaboratorRole,
      status: r.status === "active" ? "active" : "pending",
      joinedAt: r.joined_at || r.invited_at,
      userId: r.user_id,
    }))
  },

  updateCollaboratorRole: async (collaboratorId, role) => {
    const response = await apiClient<{
      id: string
      user_id: string
      role: string
      status: string
      invited_at: string
      joined_at?: string
    }>(`collaborators/${collaboratorId}`, { method: "PATCH", body: { role } })
    return {
      id: response.id,
      name: `User ${response.user_id.slice(0, 8)}`,
      email: `user-${response.user_id.slice(0, 8)}@example.com`,
      usernameWithTag: `user-${response.user_id.slice(0, 8)}`,
      role: response.role as CollaboratorRole,
      status: response.status === "active" ? "active" : "pending",
      joinedAt: response.joined_at || response.invited_at,
      userId: response.user_id,
    }
  },

  removeCollaborator: async (collaboratorId) => {
    await apiClient(`collaborators/${collaboratorId}`, { method: "DELETE" })
  },

  addComment: async (input) => {
    const response = await apiClient<{
      id: string
      user_id: string
      username: string
      content: string
      is_resolved: boolean
      created_at: string
    }>("comments", {
      method: "POST",
      body: {
        project_id: input.projectId,
        screenplay_id: input.screenplayId,
        content: input.content,
        line_number: input.lineNumber,
        char_position: 0,
        script_element_id: input.scriptElementId,
        scene_id: input.sceneId,
        parent_id: input.parentId,
      },
    })
    return {
      id: response.id,
      userName: response.username,
      content: response.content,
      timestamp: response.created_at,
      isResolved: response.is_resolved,
    }
  },

  listComments: (screenplayId) => projectsHelpers.listCommentArray(screenplayId),

  updateComment: async (commentId, patch) => {
    const body: { content?: string; is_resolved?: boolean } = {}
    if (patch.content !== undefined) body.content = patch.content
    if (patch.isResolved !== undefined) body.is_resolved = patch.isResolved
    const response = await apiClient<{
      id: string
      user_id: string
      content: string
      is_resolved: boolean
      created_at: string
    }>(`comments/${commentId}`, { method: "PATCH", body })
    return {
      id: response.id,
      userName: `User ${response.user_id.slice(0, 8)}`,
      content: response.content,
      timestamp: response.created_at,
      isResolved: response.is_resolved,
    }
  },

  deleteComment: async (commentId) => {
    await apiClient(`comments/${commentId}`, { method: "DELETE" })
  },

  listMembers: (workspaceId) =>
    apiClient<WorkspaceMember[]>(`workspaces/${workspaceId}/members`),

  inviteMember: (workspaceId, target, role) =>
    apiClient<{ invite_token: string }>(`workspaces/${workspaceId}/members/invite`, {
      method: "POST",
      body: { target, role },
    }),

  removeMember: async (workspaceId, userId) => {
    await apiClient<void>(`workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    })
  },

  updateMemberRole: (workspaceId, userId, role) =>
    apiClient<WorkspaceMember>(`workspaces/${workspaceId}/members/${userId}/role`, {
      method: "PATCH",
      body: { role },
    }),

  acceptWorkspaceInvite: (token) =>
    apiClient<Workspace>(`workspaces/invites/${token}/accept`, { method: "POST" }),
  declineWorkspaceInvite: async (token) => {
    await apiClient<void>(`workspaces/invites/${token}/decline`, { method: "POST" })
  },

  listPendingInvitations: () => apiClient<Invitation[]>("invitations"),

  acceptInvitation: async (invitationId) => {
    await apiClient<void>("invitations/accept", {
      method: "POST",
      body: { id: invitationId },
    })
  },

  declineInvitation: async (invitationId) => {
    await apiClient<void>("invitations/decline", {
      method: "POST",
      body: { id: invitationId },
    })
  },
}

// ─── Settings ─────────────────────────────────────────────────────────────

const settings: SettingsStorage = {
  updateProfile: (data) =>
    apiClient<UpdateProfileResponse>("users/me", { method: "PATCH", body: data }),
  changePassword: async (currentPassword, newPassword) => {
    await apiClient<void>("users/me/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    })
  },
  verifyPassword: (password) =>
    apiClient<boolean>("users/verify-password", {
      method: "POST",
      body: { password },
    }),
  deleteAccount: async () => {
    await apiClient<void>("users/delete-account", { method: "DELETE" })
  },
  requestDataDeletion: () =>
    apiClient<DataDeletionRequest>("users/data-deletion-request", { method: "POST" }),
  getDataDeletionStatus: async () => {
    try {
      return await apiClient<DataDeletionRequest>("users/data-deletion-request/status", {
        method: "GET",
      })
    } catch {
      return null
    }
  },
  clearCache: async () => {
    if (typeof window !== "undefined") {
      localStorage.clear()
      sessionStorage.clear()
    }
  },
}

// ─── AI ───────────────────────────────────────────────────────────────────

const ai: AiStorage = {
  listProviders: () =>
    apiClient<AIProvidersResponse>("api/ai/providers", { method: "GET" }),

  streamChat: (request: AIChatRequest) =>
    apiStreamClient("api/ai/chat", {
      method: "POST",
      body: { provider: "ollama", stream: true, ...request },
    }),
}

// ─── Admin billing ────────────────────────────────────────────────────────

const adminBilling: AdminBillingStorage = {
  getTiers: () => apiClient<SubscriptionTier[]>("api/admin/billing/tiers"),
  getTier: (tierId) => apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`),
  createTier: (tier: CreateTierInput) =>
    apiClient<SubscriptionTier>("api/admin/billing/tiers", { method: "POST", body: tier }),
  updateTier: (tierId, patch) =>
    apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`, {
      method: "PUT",
      body: patch,
    }),
  deleteTier: async (tierId) => {
    await apiClient<void>(`api/admin/billing/tiers/${tierId}`, { method: "DELETE" })
  },
  reorderTiers: async (tierIds) => {
    await apiClient<void>("api/admin/billing/tiers/reorder", {
      method: "POST",
      body: { tierIds },
    })
  },

  getGateways: () => apiClient<PaymentGateway[]>("api/admin/billing/gateways"),
  getGatewayConfig: (gatewayId) =>
    apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`),
  updateGatewayConfig: (gatewayId, config) =>
    apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`, {
      method: "PUT",
      body: config,
    }),
  setActiveGateway: async (gatewayId) => {
    await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/activate`, {
      method: "POST",
    })
  },
  toggleGatewayTestMode: async (gatewayId, testMode) => {
    await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/test-mode`, {
      method: "POST",
      body: { testMode },
    })
  },

  listUserSubscriptions: (filters) => {
    const qs = new URLSearchParams()
    if (filters?.tierId) qs.append("tierId", String(filters.tierId))
    if (filters?.status) qs.append("status", String(filters.status))
    if (filters?.page) qs.append("page", String(filters.page))
    if (filters?.limit) qs.append("limit", String(filters.limit))
    const url = `api/admin/billing/subscriptions${qs.toString() ? `?${qs}` : ""}`
    return apiClient<{ subscriptions: UserSubscription[]; total: number; pages: number }>(url)
  },
  getUserSubscription: (userId) =>
    apiClient<UserSubscription | null>(`api/admin/billing/subscriptions/user/${userId}`),
  syncSubscription: (subscriptionId) =>
    apiClient<UserSubscription>(`api/admin/billing/subscriptions/${subscriptionId}/sync`, {
      method: "POST",
    }),
  overrideUserLimits: async (userId, limits) => {
    await apiClient<void>(`api/admin/billing/users/${userId}/limits`, {
      method: "POST",
      body: limits,
    })
  },
  getUserUsage: (userId) => apiClient<UsageMetrics>(`api/admin/billing/usage/${userId}`),
  getTierUsageStats: (tierId) =>
    apiClient<{ totalUsers: number; averageUsage: UsageMetrics["metrics"] }>(
      `api/admin/billing/tiers/${tierId}/usage`,
    ),
  listAuditLogs: (filters) => {
    const qs = new URLSearchParams()
    if (filters?.adminId) qs.append("adminId", String(filters.adminId))
    if (filters?.resourceType) qs.append("resourceType", String(filters.resourceType))
    if (filters?.startDate instanceof Date)
      qs.append("startDate", filters.startDate.toISOString())
    if (filters?.endDate instanceof Date)
      qs.append("endDate", filters.endDate.toISOString())
    if (filters?.page) qs.append("page", String(filters.page))
    if (filters?.limit) qs.append("limit", String(filters.limit))
    const url = `api/admin/billing/audit-logs${qs.toString() ? `?${qs}` : ""}`
    return apiClient<{ logs: BillingAuditLog[]; total: number }>(url)
  },
  getAnalytics: () => apiClient<BillingAnalytics>("api/admin/billing/analytics"),
}

// ─── Root Storage ─────────────────────────────────────────────────────────

/** Returns a Storage implementation that talks to the Go gateway via HTTP. */
export function createRemoteStorage(): Storage {
  return {
    capabilities: REMOTE_CAPABILITIES,
    auth,
    projects,
    scenes,
    elements,
    characters,
    locations,
    beatBoard,
    workspaces,
    collaboration,
    settings,
    ai,
    admin: { billing: adminBilling },
  }
}
