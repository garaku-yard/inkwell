// ─── Sync (desktop only) ─────────────────────────────────────────────────────

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
}
