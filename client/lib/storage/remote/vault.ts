import type { VaultStorage } from "@/lib/storage"
import { NotSupportedError } from "../errors"

const rejectVault = <T>(): Promise<T> =>
  Promise.reject(new NotSupportedError("vault"))

// ─── Vault (not supported on the hosted build) ───────────────────────────

// The gateway doesn't handle Obsidian-style vaults yet — vaults are a
// desktop-first feature that reads/writes markdown files from the user's
// local disk. Every method here hard-rejects; the UI layer gates vault
// affordances behind a Tauri runtime check.
export const vault: VaultStorage = {
  openVault: () => rejectVault(),
  inspectFolder: () => rejectVault(),
  getVaultPath: async () => null,
  listNotes: () => rejectVault(),
  readNote: () => rejectVault(),
  writeNote: () => rejectVault(),
  createNote: () => rejectVault(),
  renameNote: () => rejectVault(),
  deleteNote: () => rejectVault(),
  createFolder: () => rejectVault(),
  deleteFolder: () => rejectVault(),
  getBacklinks: async () => [],
  getGraph: async () => ({ nodes: [], edges: [] }),
  listTags: async () => [],
  getNotesByTag: async () => [],
  reindexLinks: async () => {
    /* vault is desktop-only; nothing to index on the hosted build */
  },
  pruneOrphanedIndex: async () => {
    /* vault is desktop-only; nothing to reconcile on the hosted build */
  },
}
