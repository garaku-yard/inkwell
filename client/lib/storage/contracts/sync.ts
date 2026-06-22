// ─── Sync (desktop only) ─────────────────────────────────────────────────────

/** A project in the user's cloud account, for the "pull onto this device" UI. */
export interface CloudProject {
  id: string
  title: string
  category: string
  status: string
  updatedAt: string
  /** Already present in the local store on this device. */
  onThisDevice: boolean
}

/** Per-project sync status for the UI. */
export interface SyncProjectState {
  projectId: string
  /** Whether the user has opted this project into cloud sync. */
  enabled: boolean
  /** ISO timestamp of the last successful sync, or null if never. */
  lastSyncedAt: string | null
  /** idle = up to date; syncing = in flight; offline = no linked account or no
   *  network; error = the last attempt failed (see `error`). */
  status: "idle" | "syncing" | "offline" | "error"
  /** Last error message when status === "error". */
  error?: string
  /** Non-fatal heads-up from the last successful sync (status stays idle) —
   *  e.g. files skipped for being too large. Shown in the sync dropdown. */
  notice?: string
}

/**
 * Desktop-only bidirectional sync between the local SQLite store and the cloud
 * scripts-service. Opt-in per project; a sync is a full-snapshot push followed
 * by applying the server's pulled delta. No-ops without a linked cloud account.
 * The remote (web) build does not implement sync — it *is* the cloud client.
 */
export interface SyncStorage {
  /** Whether sync can run right now (a cloud account is linked). */
  isAvailable(): Promise<boolean>
  /** Current sync state for a project (disabled/idle if never opted in). */
  getState(projectId: string): Promise<SyncProjectState>
  /** State for every sync-enabled project. */
  listEnabled(): Promise<SyncProjectState[]>
  /** Opt a project in/out of cloud sync. Enabling triggers an initial sync. */
  setEnabled(projectId: string, enabled: boolean): Promise<void>
  /** Run one sync round-trip for a project; no-op if disabled or not linked. */
  syncProject(projectId: string): Promise<SyncProjectState>
  /** Sync every enabled project, returning each one's resulting state. */
  syncAll(): Promise<SyncProjectState[]>
  /** List the user's cloud projects, flagging which are already on this device.
   *  Empty when not linked. */
  listCloudProjects(): Promise<CloudProject[]>
  /** Pull a cloud project onto this device (enables sync + an initial pull, so
   *  its rows are written into the local store). A vault project additionally
   *  needs a destination folder and its metadata: its files (not a project row)
   *  are what sync, so the local project row must be seeded before the first pull
   *  knows where to write. DB-backed projects ignore `opts` — their rows arrive
   *  via the pull itself. */
  pullProject(projectId: string, opts?: PullProjectOptions): Promise<void>
}

/** Extra inputs for pulling a vault project onto a fresh device. */
export interface PullProjectOptions {
  /** Absolute path of the local folder the vault's files should land in. */
  vaultFolder?: string
  /** Cloud project metadata used to seed the local project row (vault only). */
  meta?: CloudProject
}
