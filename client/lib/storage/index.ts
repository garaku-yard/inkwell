/**
 * Storage — single abstraction every UI call funnels through.
 *
 * Inkwell ships in two flavours: a hosted web build that talks to the Go
 * gateway, and a local-first desktop build (Tauri) that stores everything on
 * disk in SQLite. Both wear the same API shape so the UI layer doesn't need
 * to know which backend is underneath.
 *
 * ## Layout
 *
 * - {@link Storage} is a flat object of sub-interfaces, one per bounded
 *   context (`projects`, `scenes`, `beats`, …). Sub-interfaces stay
 *   alphabetical to keep diffs boring.
 * - Capabilities that only the hosted build can satisfy (real-time collab,
 *   admin, central auth) live behind {@link Capability} probes. Callers that
 *   depend on one must either gate on `storage.capabilities.has("xyz")` or
 *   be prepared to catch {@link NotSupportedError}.
 * - Data types are re-exported from the existing `client/services/*` files
 *   so we don't fork the vocabulary. When a type moves, the import moves
 *   with it.
 *
 * ## Implementations
 *
 * - `remote.ts` — wraps the existing `apiClient` / `apiStreamClient` calls.
 *   Drop-in replacement for today's services. Built in Phase 2 step 3.
 * - `local.ts` — talks to `tauri-plugin-sql` via IPC, mirroring the scripts
 *   service's Postgres schema in SQLite. Built in Phase 2 step 5.
 *
 * ## Not implemented yet
 *
 * This file is an *interface-only* draft. The factory at the bottom is a
 * stub that throws until we ship `remote.ts`. Importing `Storage` or the
 * supporting types is safe today; calling `getStorage()` is not.
 */

import type { AuthResponse, RegisterRequest } from "@/services/auth"
import type {
  Act,
  Character,
  Comment,
  CreateProjectRequest,
  FullProject,
  Location,
  Project,
  ProjectCollaborator,
  Scene,
  ScriptElement,
  UpdateProjectRequest,
} from "@/services/project"
import type { Beat, BeatBoardData, Connection } from "@/services/beat"
import type { Lane, OutlineItem } from "@/services/beat-board"
import type {
  Category,
  Workspace,
  WorkspaceMember,
  WorkspacesResponse,
} from "@/services/workspace"
import type {
  CreateElementRequest,
  UpdateElementRequest,
} from "@/services/editor"
import type {
  AIChatRequest,
  AIProvidersResponse,
} from "@/services/ai"
import type { Invitation } from "@/services/invites"
import type {
  DataDeletionRequest,
  UpdateProfileData,
  UpdateProfileResponse,
} from "@/services/settings"
import type {
  BillingAuditLog,
  GatewayConfig,
  PaymentGateway,
  SubscriptionTier,
  UsageMetrics,
  UserSubscription,
} from "@/types/billing"

import { NotSupportedError, StorageError } from "./errors"

export * from "./errors"
export type {
  Act,
  AIChatRequest,
  AIProvidersResponse,
  AuthResponse,
  Beat,
  BeatBoardData,
  BillingAuditLog,
  Category,
  Character,
  Comment,
  Connection,
  CreateElementRequest,
  CreateProjectRequest,
  DataDeletionRequest,
  FullProject,
  GatewayConfig,
  Invitation,
  Lane,
  Location,
  OutlineItem,
  PaymentGateway,
  Project,
  ProjectCollaborator,
  RegisterRequest,
  Scene,
  ScriptElement,
  SubscriptionTier,
  UpdateElementRequest,
  UpdateProfileData,
  UpdateProfileResponse,
  UpdateProjectRequest,
  UsageMetrics,
  UserSubscription,
  Workspace,
  WorkspaceMember,
  WorkspacesResponse,
}

// ─── Capabilities ──────────────────────────────────────────────────────────

/** Optional feature areas a Storage implementation can declare. The remote
 *  implementation supports all of them; the local (desktop) one declares
 *  only the subset that works offline. */
export type Capability =
  | "auth" // Central login / register / sessions (remote only).
  | "collaboration" // Shared projects, collaborators, invites, comments.
  | "realtime" // Presence + live cursors (never in local build).
  | "admin" // Billing admin endpoints (remote only).
  | "ai.hosted" // Hosted AI service vs. direct provider calls.

// ─── Auth ─────────────────────────────────────────────────────────────────

/** Minimal shape of the current user returned by {@link AuthStorage.me}. */
export interface CurrentUser {
  id: string
  email: string
  username: string
  tag: string
  role: string
  name: string
  lastName: string
}

export interface AuthStorage {
  /** Log in with email + password. Remote sets the httpOnly cookie; local
   *  returns a synthesised user from the on-disk profile. */
  login(credentials: { email: string; password: string }): Promise<AuthResponse>
  /** Create a new account. Remote sets the httpOnly cookie on success. */
  register(payload: RegisterRequest): Promise<AuthResponse>
  /** Clear the session (cookie remote-side; in-memory local-side). */
  logout(): Promise<void>
  /** Return the currently authenticated user, or null when signed out. */
  me(): Promise<CurrentUser | null>
}

// ─── Projects ─────────────────────────────────────────────────────────────

export interface ProjectStorage {
  create(input: CreateProjectRequest): Promise<Project>
  getById(projectId: string, userId: string): Promise<Project>
  /** Fetches project + scenes + elements + comments in one logical call.
   *  Remote stitches multiple HTTP calls; local can do one SQL join. */
  getFull(projectId: string, userId: string): Promise<FullProject>
  listOwned(userId: string): Promise<{ projects: Project[]; total: number }>
  /** Projects shared with the caller (collaboration capability required). */
  listShared(): Promise<Project[]>
  update(projectId: string, userId: string, patch: UpdateProjectRequest): Promise<Project>
  toggleStar(projectId: string, userId: string): Promise<Project>
  delete(projectId: string, userId: string): Promise<void>
}

// ─── Scenes & elements ────────────────────────────────────────────────────

/** Fields accepted when creating a new scene. Mirrors what the scripts service
 *  expects; `outline_unit_id` and `order_index` are optional. */
export interface CreateSceneInput {
  scene_heading: string
  content?: string
  outline_unit_id?: string
  order_index?: number
}

export interface SceneStorage {
  create(projectId: string, userId: string, input: CreateSceneInput): Promise<Scene>
  listForProject(projectId: string, userId: string): Promise<Scene[]>
  updateHeading(sceneId: string, userId: string, heading: string): Promise<Scene>
  delete(sceneId: string): Promise<void>
}

export interface ElementStorage {
  /** Create via the scene-level endpoint (used by the editor). */
  create(input: CreateElementRequest): Promise<ScriptElement>
  listForScene(sceneId: string, userId: string): Promise<ScriptElement[]>
  update(elementId: string, patch: UpdateElementRequest): Promise<ScriptElement>
  delete(elementId: string): Promise<void>
  /** Range query used by the outline editor when only a line window is visible. */
  listForProject(projectId: string, userId: string, startLine?: number, endLine?: number): Promise<ScriptElement[]>
}

// ─── Characters & locations ───────────────────────────────────────────────

export interface CreateCharacterInput {
  name: string
  description?: string
  role?: string
  attributes?: Record<string, string>
}

export interface CharacterStorage {
  create(projectId: string, userId: string, input: CreateCharacterInput): Promise<Character>
  listForProject(projectId: string, userId: string): Promise<Character[]>
}

export interface CreateLocationInput {
  name: string
  description?: string
  type?: string
}

export interface LocationStorage {
  create(projectId: string, userId: string, input: CreateLocationInput): Promise<Location>
  listForProject(projectId: string, userId: string): Promise<Location[]>
}

// ─── Beat board ───────────────────────────────────────────────────────────

export interface BeatBoardStorage {
  /** Load the entire board for a project — beats, connections, lanes, outline
   *  items — in one call. */
  getBoard(projectId: string): Promise<BeatBoardData>

  createBeat(projectId: string, input: Partial<Beat>): Promise<Beat>
  updateBeat(beatId: string, patch: Partial<Beat>): Promise<Beat>
  deleteBeat(beatId: string): Promise<void>

  createConnection(projectId: string, input: Partial<Connection>): Promise<Connection>
  deleteConnection(connectionId: string): Promise<void>

  createLane(projectId: string, input: Partial<Lane>): Promise<Lane>
  updateLane(laneId: string, patch: Partial<Lane>): Promise<void>
  updateLaneOrder(projectId: string, orderedIds: string[]): Promise<void>

  createOutlineItem(projectId: string, input: Partial<OutlineItem>): Promise<OutlineItem>
  updateOutlineItem(itemId: string, patch: Partial<OutlineItem>): Promise<void>
  deleteOutlineItem(itemId: string): Promise<void>
}

// ─── Workspaces ───────────────────────────────────────────────────────────

export interface WorkspaceStorage {
  listCategories(): Promise<Category[]>
  list(): Promise<WorkspacesResponse>
  createPersonal(userId: string, categorySlugs: string[]): Promise<{ workspaces: Workspace[] }>
  /** Local build creates a purely-local org; hosted build creates a real one. */
  createOrg(input: { name: string; description?: string; category_slugs?: string[] }): Promise<Workspace>
  get(workspaceId: string): Promise<Workspace>
  update(workspaceId: string, patch: Partial<Workspace>): Promise<Workspace>
  delete(workspaceId: string): Promise<void>
  enableCategory(workspaceId: string, slug: string): Promise<Workspace>
  disableCategory(workspaceId: string, slug: string): Promise<Workspace>
}

// ─── Collaboration (collaborators, invites, comments) ─────────────────────

export interface CollaborationStorage {
  // Project-level collaborators
  addCollaborator(projectId: string, email: string, role: string): Promise<ProjectCollaborator>
  listCollaborators(projectId: string): Promise<ProjectCollaborator[]>
  updateCollaboratorRole(collaboratorId: string, role: string): Promise<ProjectCollaborator>
  removeCollaborator(collaboratorId: string): Promise<void>

  // Comments
  addComment(input: {
    projectId: string
    screenplayId: string
    content: string
    lineNumber: number
    scriptElementId?: string
    sceneId?: string
    parentId?: string
  }): Promise<Comment>
  listComments(screenplayId: string): Promise<Comment[]>
  updateComment(commentId: string, patch: { content?: string; isResolved?: boolean }): Promise<Comment>
  deleteComment(commentId: string): Promise<void>

  // Workspace members
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>
  inviteMember(workspaceId: string, target: string, role: string): Promise<{ invite_token: string }>
  removeMember(workspaceId: string, userId: string): Promise<void>
  updateMemberRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMember>

  // Workspace invites
  acceptWorkspaceInvite(token: string): Promise<Workspace>
  declineWorkspaceInvite(token: string): Promise<void>

  // Generic project-invite inbox
  listPendingInvitations(): Promise<Invitation[]>
  acceptInvitation(invitationId: string): Promise<void>
  declineInvitation(invitationId: string): Promise<void>
}

// ─── Settings ─────────────────────────────────────────────────────────────

export interface SettingsStorage {
  updateProfile(data: UpdateProfileData): Promise<UpdateProfileResponse>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  verifyPassword(password: string): Promise<boolean>
  deleteAccount(): Promise<void>
  requestDataDeletion(): Promise<DataDeletionRequest>
  getDataDeletionStatus(): Promise<DataDeletionRequest | null>
  /** Pure client-side cache wipe. Implementations that don't keep a cache can
   *  no-op. */
  clearCache(): Promise<void>
}

// ─── Vault (Obsidian-style markdown, files-on-disk) ──────────────────────

/** A single markdown note inside a vault project. Notes are real `.md`
 *  files on the user's disk; the vault storage layer reads them on demand
 *  rather than caching the full text. */
export interface VaultNote {
  /** Relative path from the vault root, including `.md`. Use this as the
   *  stable key — two notes in different folders can share a title but
   *  never a full path. Examples: `"notes.md"`, `"projects/alpha/spec.md"`. */
  filename: string
  /** Absolute path to the note on disk. */
  path: string
  /** Basename without the `.md` extension, used as the display title. */
  title: string
  /** Relative parent folder within the vault. Empty string for
   *  vault-root notes, otherwise e.g. `"projects/alpha"`. */
  folder: string
  /** ISO 8601 timestamp of the last on-disk modification. */
  updatedAt: string
}

/** A note that links to the currently-open note via `[[Title]]`. The
 *  `snippet` is a short excerpt of the surrounding line for context. */
export interface VaultBacklink {
  filename: string
  title: string
  snippet: string
}

export interface VaultStorage {
  /** Attach a vault folder to an existing vault project. Idempotent — callers
   *  can re-run this to change the folder later. */
  openVault(projectId: string, folderPath: string): Promise<void>
  /** Returns the absolute vault path stored for the project, or null when
   *  the user hasn't chosen a folder yet. */
  getVaultPath(projectId: string): Promise<string | null>
  /** Lists every `.md` file in the vault recursively, sorted by relative
   *  path. `filename` on each entry is the vault-relative path. */
  listNotes(projectId: string): Promise<VaultNote[]>
  /** Reads the raw markdown content of a note. `filename` is the
   *  vault-relative path (possibly with folder segments). */
  readNote(projectId: string, filename: string): Promise<string>
  /** Writes raw markdown to a note, creating the file + any missing
   *  parent directories when needed. */
  writeNote(projectId: string, filename: string, content: string): Promise<void>
  /** Creates an empty note with the given title (`.md` added automatically).
   *  Optional `folder` places the note inside a subfolder (auto-created).
   *  Returns the created note record. Appends a counter when names collide. */
  createNote(projectId: string, title: string, folder?: string): Promise<VaultNote>
  /** Deletes the note from disk. `filename` is the vault-relative path. */
  deleteNote(projectId: string, filename: string): Promise<void>
  /** Creates an empty subfolder inside the vault. `relPath` is relative
   *  to the vault root. Intermediate folders are created automatically. */
  createFolder(projectId: string, relPath: string): Promise<void>
  /** Deletes a subfolder and every note/subfolder underneath it. Use
   *  with care — the operation is irreversible. */
  deleteFolder(projectId: string, relPath: string): Promise<void>
  /** Scans every other note in the vault for `[[title]]` references and
   *  returns the matches. Case-insensitive by design so casual link
   *  authoring keeps working. Aliases (`[[title|alias]]`) match on title. */
  getBacklinks(projectId: string, title: string): Promise<VaultBacklink[]>
  /** Re-reads a single note from disk and refreshes its row set in the
   *  backlinks index. Primarily used by the filesystem watcher when an
   *  external tool (vim, Obsidian, `git checkout`) writes into the vault.
   *  When the file no longer exists, the note's outbound rows are deleted
   *  instead — keeps ghost sources out of backlinks. */
  reindexLinks(projectId: string, filename: string): Promise<void>
}

// ─── AI ───────────────────────────────────────────────────────────────────

export interface AiStorage {
  /** List providers the user has keys for (desktop) or the server has keys
   *  for (web). Desktop reads from OS keychain; web calls the AI service. */
  listProviders(): Promise<AIProvidersResponse>
  /** NDJSON streaming chat completion. Desktop calls the provider directly
   *  with the user's BYO key; web delegates to the AI service. */
  streamChat(request: AIChatRequest): Promise<ReadableStream<Uint8Array>>
}

// ─── Admin (remote-only) ──────────────────────────────────────────────────

/** Input accepted by {@link AdminBillingStorage.createTier}. Matches the
 *  wire shape: every tier field except server-generated id + timestamps. */
export type CreateTierInput = Omit<SubscriptionTier, "id" | "createdAt" | "updatedAt">

/** Shape returned by {@link AdminBillingStorage.getAnalytics}. The server
 *  hands back labelled arrays rather than keyed records so the UI can render
 *  them without an extra lookup. */
export interface BillingAnalytics {
  /** Monthly recurring revenue in USD cents. */
  mrr: number
  /** Annual recurring revenue in USD cents. */
  arr: number
  /** Churn rate as a decimal fraction (e.g. 0.05 = 5%). */
  churnRate: number
  /** Subscriber count per tier. */
  tierDistribution: { tierId: string; tierName: string; count: number }[]
  /** Revenue per tier in USD cents. */
  revenueByTier: { tierId: string; tierName: string; revenue: number }[]
}

export interface AdminBillingStorage {
  getTiers(): Promise<SubscriptionTier[]>
  getTier(tierId: string): Promise<SubscriptionTier>
  createTier(tier: CreateTierInput): Promise<SubscriptionTier>
  updateTier(tierId: string, patch: Partial<SubscriptionTier>): Promise<SubscriptionTier>
  deleteTier(tierId: string): Promise<void>
  reorderTiers(tierIds: string[]): Promise<void>

  getGateways(): Promise<PaymentGateway[]>
  getGatewayConfig(gatewayId: string): Promise<GatewayConfig>
  updateGatewayConfig(gatewayId: string, config: GatewayConfig): Promise<GatewayConfig>
  setActiveGateway(gatewayId: string): Promise<void>
  toggleGatewayTestMode(gatewayId: string, testMode: boolean): Promise<void>

  listUserSubscriptions(filters?: Record<string, unknown>): Promise<{
    subscriptions: UserSubscription[]
    total: number
    pages: number
  }>
  getUserSubscription(userId: string): Promise<UserSubscription | null>
  syncSubscription(subscriptionId: string): Promise<UserSubscription>
  overrideUserLimits(userId: string, limits: Record<string, unknown>): Promise<void>
  getUserUsage(userId: string): Promise<UsageMetrics>
  getTierUsageStats(tierId: string): Promise<{ totalUsers: number; averageUsage: UsageMetrics["metrics"] }>
  listAuditLogs(filters?: Record<string, unknown>): Promise<{ logs: BillingAuditLog[]; total: number }>
  getAnalytics(): Promise<BillingAnalytics>
}

// ─── Root Storage ────────────────────────────────────────────────────────

/** Root abstraction composed of per-domain sub-interfaces. */
export interface Storage {
  readonly capabilities: ReadonlySet<Capability>

  auth: AuthStorage
  projects: ProjectStorage
  scenes: SceneStorage
  elements: ElementStorage
  characters: CharacterStorage
  locations: LocationStorage
  beatBoard: BeatBoardStorage
  workspaces: WorkspaceStorage
  collaboration: CollaborationStorage
  settings: SettingsStorage
  vault: VaultStorage
  ai: AiStorage
  admin: { billing: AdminBillingStorage }
}

// ─── Factory ──────────────────────────────────────────────────────────────

let instance: Storage | null = null

/**
 * Returns the process-wide Storage instance. The web build binds to the
 * remote implementation; the Tauri build binds to the local one at module
 * init time. Until the implementations land in Phase 2 step 3/5, this
 * throws — on purpose — so we notice if something imports it prematurely.
 */
export function getStorage(): Storage {
  if (instance) return instance
  throw new StorageError(
    "Storage has no implementation bound yet — waiting on Phase 2 step 3 (remote.ts) and step 5 (local.ts).",
  )
}

/** Bind a concrete Storage implementation. Usually called once at app boot,
 *  but `StorageProvider` may call it a second time in the desktop build after
 *  the async local impl finishes loading, so subsequent calls replace the
 *  existing instance rather than throwing. */
export function setStorage(impl: Storage): void {
  instance = impl
}

/** Convenience guard for callers that want to branch on a capability without
 *  first pulling the whole Storage object. Throws {@link NotSupportedError}
 *  when the current build cannot honour the request. */
export function requireCapability(storage: Storage, cap: Capability): void {
  if (!storage.capabilities.has(cap)) {
    throw new NotSupportedError(cap)
  }
}
