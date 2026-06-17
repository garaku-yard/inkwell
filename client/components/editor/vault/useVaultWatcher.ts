import type React from "react"
import { useEffect, useRef } from "react"
import { isTauri } from "@tauri-apps/api/core"

import type { Storage, VaultBacklink } from "@/lib/storage"
import { allowFsDir } from "@/lib/tauri-scope"

interface UseVaultWatcherOptions {
  vaultPath: string | null
  projectId: string
  storage: Storage
  selectedFilenameRef: React.RefObject<string | null>
  dirty: boolean
  /** Sidebar refresh — called on every coalesced batch of fs events.
   *  Cheap (SQL-free directory read) so it's safe to fire eagerly. */
  onSidebarRefresh: () => Promise<unknown> | void
  /** Backlinks reload — called when the current note's incoming-link
   *  set might have changed. Cheaper to re-run the query than to diff. */
  onBacklinksReload: (links: VaultBacklink[]) => void
  /** Editor content reload — called only when the local buffer is
   *  clean (dirty=false), so we don't clobber unsaved edits. The
   *  hook calls back with the disk body and the parent decides how to
   *  apply it (typically setContent with a same-string short-circuit). */
  onContentReload: (filename: string, body: string) => void
}

/** Subscribes to filesystem events under `vaultPath` and reflects
 *  external edits (vim, obsidian, git checkout, etc.) back into the
 *  app: sidebar refresh, backlink-index re-keying, and a buffer
 *  reload when the user has nothing unsaved. Tauri-only — bails out
 *  silently in the web build because there's nothing to watch. */
export function useVaultWatcher({
  vaultPath,
  projectId,
  storage,
  selectedFilenameRef,
  dirty,
  onSidebarRefresh,
  onBacklinksReload,
  onContentReload,
}: UseVaultWatcherOptions): void {
  // Stable refs for the watcher callback — the useEffect below runs
  // once per vault-path change, and we don't want to resubscribe just
  // because `dirty` flipped on a keystroke.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // Throttle the orphaned-index sweep — it walks the whole vault, so we
  // don't want it on every autosave-triggered batch during active editing.
  const lastPruneAtRef = useRef(0)

  const onSidebarRefreshRef = useRef(onSidebarRefresh)
  onSidebarRefreshRef.current = onSidebarRefresh

  const onBacklinksReloadRef = useRef(onBacklinksReload)
  onBacklinksReloadRef.current = onBacklinksReload

  const onContentReloadRef = useRef(onContentReload)
  onContentReloadRef.current = onContentReload

  useEffect(() => {
    if (!vaultPath || !isTauri()) return
    let active = true
    let unwatch: (() => Promise<void> | void) | undefined

    void (async () => {
      try {
        // Ensure this process is allowed to watch the vault subtree (the app
        // grants fs scope at runtime rather than statically).
        await allowFsDir(vaultPath, true)
        // `watch` collects change events during `delayMs` and fires once —
        // cheaper than `watchImmediate` when a save touches several files
        // (e.g. our autosave + an editor tool running in parallel).
        const { watch } = await import("@tauri-apps/plugin-fs")
        const stop = await watch(
          vaultPath,
          (event) => {
            if (!active) return
            // Always refresh the sidebar; cheap SQL-free directory read.
            void onSidebarRefreshRef.current()

            // Keep the backlinks index honest when external tools touch
            // `.md` files. Paths come in absolute; convert back to
            // vault-relative so nested notes reindex correctly.
            const paths: string[] = Array.isArray(event?.paths) ? event.paths : []
            const normalisedRoot = vaultPath.replace(/[\\/]+$/, "")
            const changedMd = new Set<string>()
            for (const p of paths) {
              if (!p.toLowerCase().endsWith(".md")) continue
              const normalised = p.replace(/\\/g, "/")
              const rootForwardSlash = normalisedRoot.replace(/\\/g, "/")
              if (normalised.startsWith(rootForwardSlash + "/")) {
                changedMd.add(normalised.slice(rootForwardSlash.length + 1))
              } else if (normalised.startsWith(rootForwardSlash)) {
                changedMd.add(
                  normalised.slice(rootForwardSlash.length).replace(/^\/+/, ""),
                )
              } else {
                // Fallback to basename if we can't re-root the path.
                const name = p.split(/[\\/]/).pop()
                if (name) changedMd.add(name)
              }
            }
            for (const filename of changedMd) {
              void storage.vault.reindexLinks(projectId, filename).catch(() => {})
            }

            // Safety net for delete-less external renames: some platforms emit
            // only a "create" for the new name, so the old path never reaches
            // reindexLinks above and its rows (embeddings especially) orphan.
            // Reconcile against the full on-disk listing — throttled because it
            // walks the vault.
            if (changedMd.size > 0) {
              const nowMs = Date.now()
              if (nowMs - lastPruneAtRef.current > 10_000) {
                lastPruneAtRef.current = nowMs
                void storage.vault.pruneOrphanedIndex(projectId).catch(() => {})
              }
            }

            // Kick the backlinks panel to refresh if the current note is
            // linked-from any of the changed files. Cheaper to just
            // re-run the query than to diff.
            if (selectedFilenameRef.current) {
              void storage.vault
                .getBacklinks(
                  projectId,
                  selectedFilenameRef.current.replace(/\.md$/i, ""),
                )
                .then((list) => {
                  if (active) onBacklinksReloadRef.current(list)
                })
                .catch(() => {})
            }

            // Only reload the current buffer from disk if there are no
            // local unsaved edits, otherwise we'd clobber the user's work.
            const openFile = selectedFilenameRef.current
            if (openFile && !dirtyRef.current) {
              storage.vault
                .readNote(projectId, openFile)
                .then((body) => {
                  if (!active) return
                  onContentReloadRef.current(openFile, body)
                })
                .catch(() => {
                  /* file vanished — sidebar refresh will drop it */
                })
            }
          },
          // Recursive so edits anywhere under the vault — including
          // nested subfolders — trigger a refresh. `delayMs` coalesces
          // bursts (e.g. a save that touches several files at once).
          { recursive: true, delayMs: 300 },
        )
        if (!active) {
          void stop()
          return
        }
        unwatch = stop
      } catch (err) {
        console.warn("Vault watcher unavailable:", err)
      }
    })()

    return () => {
      active = false
      if (unwatch) void unwatch()
    }
  }, [vaultPath, projectId, storage, selectedFilenameRef])
}
