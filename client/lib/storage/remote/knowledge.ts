import type { KnowledgeStorage } from "@/lib/storage"

// ─── Knowledge (not supported on the hosted build) ───────────────────────

// Vault-as-knowledge is a desktop-first feature: embeddings run in the
// webview against markdown files on the user's local disk, and the gateway
// has no access to those. Every method degrades gracefully — no scopes, no
// retrieval — so web chat simply runs without note context.
export const knowledge: KnowledgeStorage = {
  getScopes: async () => [],
  setScopes: async () => {
    /* hosted build has no local vault to wire */
  },
  hasScopes: async () => false,
  buildIndex: async () => ({ notes: 0, chunks: 0 }),
  getIndexStatus: async () => ({ notes: 0, chunks: 0 }),
  retrieve: async () => [],
  readNoteForTool: async () => null,
}
