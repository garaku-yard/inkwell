"use client"

/**
 * useEditorRealtime — the shared live co-editing wiring for the scene/element
 * editors (prose, poetry, comic, TTRPG, IF). Each of those stores its document
 * as `Scene[]` (scenes/chapters/pages/sections), each scene carrying a
 * `scene_heading` and `elements`, and edits flow through a
 * `handleContentChange(id, content, isScene)`. This hook owns the realtime
 * mechanics around that shape:
 *
 *   - broadcastEdit: debounce live content changes onto the room (call it from
 *     the editor's change handler, alongside the existing autosave).
 *   - apply remote edits to `setScenes`, skipping the element the local writer
 *     is actively editing in *this focused window* (the cursor-jump guard — a
 *     background window still applies, since the user isn't typing there).
 *   - resync from the DB on reconnect, preserving the mid-keystroke node.
 *   - report the local caret (useCaretReporter) for the {@link RemoteCarets}
 *     overlay, which the editor mounts with the same surface ref.
 *
 * It is editor-agnostic: only the `Scene[]` setter, the surface ref, and the
 * project/user ids are needed. Format-specific UI (soft-lock pips, the focus
 * label) stays in each editor, which can use the returned `peers`/`reportFocus`.
 */

import { useCallback, useEffect, useRef } from "react"
import type { Dispatch, RefObject, SetStateAction } from "react"

import { useProjectPresence } from "@/lib/realtime/PresenceContext"
import type { Peer } from "@/lib/realtime/protocol"
import type { CaretSubscriber } from "@/hooks/useRealtimePresence"
import { getFullProject, type Scene } from "@/services/project"

import { mergeResyncedScenes } from "./resync"
import { useCaretReporter } from "./useCaretReporter"

/** How long live edits coalesce before going to the room (ms) — separate from
 *  the longer autosave debounce, so co-editors see typing land within a beat. */
const EDIT_BROADCAST_DEBOUNCE_MS = 150

interface UseEditorRealtimeOptions {
  projectId: string
  userId: string | undefined
  /** Setter for the editor's document state (its `Scene[]`). */
  setScenes: Dispatch<SetStateAction<Scene[]>>
  /** The write surface element; scopes caret reporting and hosts the overlay. */
  surfaceRef: RefObject<HTMLElement | null>
}

interface UseEditorRealtimeResult {
  /** Other people in the room (for soft-lock UI); empty on the desktop build. */
  peers: Peer[]
  /** Whether the realtime socket is connected. */
  connected: boolean
  /** Broadcast a live content change; call from the editor's change handler. */
  broadcastEdit: (elementId: string, content: string, isScene: boolean) => void
  /** Report the element/section this client is editing (presence "editing X"). */
  reportFocus: (elementId: string, label?: string) => void
  /** Pass to `<RemoteCarets subscribeCarets=...>`. */
  subscribeCarets: (handler: CaretSubscriber) => () => void
}

export function useEditorRealtime({
  projectId,
  userId,
  setScenes,
  surfaceRef,
}: UseEditorRealtimeOptions): UseEditorRealtimeResult {
  const {
    peers,
    connected,
    setFocus,
    sendEdit,
    sendCaret,
    subscribeEdits,
    subscribeCarets,
    subscribeResync,
  } = useProjectPresence()

  useCaretReporter({ containerRef: surfaceRef, sendCaret, enabled: connected })

  // Per-id debounce so switching elements never drops the last edit.
  const editTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const broadcastEdit = useCallback(
    (id: string, content: string, isScene: boolean) => {
      const timers = editTimersRef.current
      const pending = timers.get(id)
      if (pending) clearTimeout(pending)
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id)
          sendEdit(id, content, isScene)
        }, EDIT_BROADCAST_DEBOUNCE_MS),
      )
    },
    [sendEdit],
  )
  useEffect(() => {
    const timers = editTimersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  // Apply co-editors' content changes, except to the element the local writer
  // is actively editing in this focused window (their caret/content win).
  useEffect(() => {
    return subscribeEdits((edit) => {
      const domId = edit.isScene ? `head-${edit.elementId}` : `el-${edit.elementId}`
      if (
        typeof document !== "undefined" &&
        document.hasFocus() &&
        document.activeElement?.id === domId
      ) {
        return
      }
      setScenes((prev) =>
        edit.isScene
          ? prev.map((s) => (s.id === edit.elementId ? { ...s, scene_heading: edit.content } : s))
          : prev.map((s) => ({
              ...s,
              elements: (s.elements ?? []).map((el) =>
                el.id === edit.elementId ? { ...el, content: edit.content } : el,
              ),
            })),
      )
    })
  }, [subscribeEdits, setScenes])

  // On reconnect, refetch the DB (source of truth) and reconcile, keeping only
  // the node the writer is mid-keystroke on so a resync never yanks their caret.
  useEffect(() => {
    return subscribeResync(async () => {
      if (!userId) return
      try {
        const fresh = await getFullProject(projectId, userId)
        const activeDomId =
          typeof document !== "undefined" ? document.activeElement?.id : undefined
        setScenes((prev) => mergeResyncedScenes(prev, fresh.scenes ?? [], activeDomId))
      } catch {
        // A failed refetch leaves local state as-is; the next reconnect retries.
      }
    })
  }, [subscribeResync, userId, projectId, setScenes])

  return { peers, connected, broadcastEdit, reportFocus: setFocus, subscribeCarets }
}
