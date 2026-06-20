import type { SyncStorage } from "@/lib/storage"
import { NotSupportedError } from "@/lib/storage"

// The web build IS the cloud client — there's no separate local store to sync.
// `sync` is not declared as a capability here, so callers gate before using it;
// these inert stubs only satisfy the Storage interface.
export const sync: SyncStorage = {
  isAvailable: async () => false,
  getState: async (projectId) => ({ projectId, enabled: false, lastSyncedAt: null, status: "idle" }),
  listEnabled: async () => [],
  setEnabled: async () => {
    throw new NotSupportedError("sync")
  },
  syncProject: async () => {
    throw new NotSupportedError("sync")
  },
  syncAll: async () => [],
}
