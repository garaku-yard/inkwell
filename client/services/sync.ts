/** Desktop project sync — delegates to the bound Storage's sync domain. All
 *  no-op / unavailable on the web build (which doesn't declare the `sync`
 *  capability). See lib/storage/contracts/sync.ts. */

import { getStorage } from "@/lib/storage"
import type { CloudProject, PullProjectOptions, SyncProjectState } from "@/lib/storage"

export type { CloudProject, PullProjectOptions, SyncProjectState }

/** Whether sync can run right now (desktop + a linked cloud account). */
export const isSyncAvailable = (): Promise<boolean> => getStorage().sync.isAvailable()

/** Current sync state for a project. */
export const getSyncState = (projectId: string): Promise<SyncProjectState> =>
  getStorage().sync.getState(projectId)

/** State for every sync-enabled project. */
export const listSyncedProjects = (): Promise<SyncProjectState[]> =>
  getStorage().sync.listEnabled()

/** Opt a project in/out of cloud sync (enabling triggers an initial sync). */
export const setSyncEnabled = (projectId: string, enabled: boolean): Promise<void> =>
  getStorage().sync.setEnabled(projectId, enabled)

/** Run one sync round-trip for a project. */
export const syncProject = (projectId: string): Promise<SyncProjectState> =>
  getStorage().sync.syncProject(projectId)

/** Sync every enabled project. */
export const syncAllProjects = (): Promise<SyncProjectState[]> =>
  getStorage().sync.syncAll()

/** List the user's cloud projects (flagging which are already on this device). */
export const listCloudProjects = (): Promise<CloudProject[]> =>
  getStorage().sync.listCloudProjects()

/** Pull a cloud project onto this device. Vault projects pass `vaultFolder` +
 *  `meta` so the local row + folder are seeded before the first file pull. */
export const pullCloudProject = (projectId: string, opts?: PullProjectOptions): Promise<void> =>
  getStorage().sync.pullProject(projectId, opts)
