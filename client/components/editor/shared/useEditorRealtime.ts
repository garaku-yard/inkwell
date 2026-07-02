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

import { useCallback, useEffect, useMemo, useRef } from "react"
import type { Dispatch, RefObject, SetStateAction } from "react"

import { useProjectPresence } from "@/lib/realtime/PresenceContext"
import { useDurableSessions } from "@/lib/realtime/useDurableSessions"
import type { Peer } from "@/lib/realtime/protocol"
import type { CaretSubscriber } from "@/hooks/useRealtimePresence"
import { getFullProject, type Scene } from "@/services/project"

import { mergeResyncedScenes } from "./resync"
import { useCaretReporter } from "./useCaretReporter"

/** How long live edits coalesce before going to the room (ms) — separate from
 *  the longer autosave debounce, so co-editors see typing land within a beat. */
const EDIT_BROADCAST_DEBOUNCE_MS = 150
/** Min gap between structure-refetch resyncs, so a collaborator adding several
 *  elements in a burst triggers at most one refetch per window. */
const RESYNC_THROTTLE_MS = 1500

interface UseEditorRealtimeOptions {
  projectId: string
  userId: string | undefined
  /** The editor's current document, used to tell whether an incoming edit
   *  targets an element we already have (apply it) or a new one a collaborator
   *  just created (refetch to pick up the structure — adds aren't broadcast). */
  scenes: Scene[]
  /** Setter for the editor's document state (its `Scene[]`). */
  setScenes: Dispatch<SetStateAction<Scene[]>>
  /** The write surface element; scopes caret reporting and hosts the overlay. */
  surfaceRef: RefObject<HTMLElement | null>
  /** The scene the local user is currently working in. Reported as presence
   *  focus (so collaborators read "editing X" and get a durable soft-lock on it)
   *  and used as the key space for {@link UseEditorRealtimeResult.peersByElement}.
   *  Omit (or pass null) to not report focus. */
  focusId?: string | null
  /** Human-readable label for `focusId` — e.g. the scene heading — shown in the
   *  "editing X" presence tooltip. */
  focusLabel?: string
}

interface UseEditorRealtimeResult {
  /** Other people connected to the room right now (live presence); empty on the
   *  desktop build. */
  peers: Peer[]
  /** Whether the realtime socket is connected. */
  connected: boolean
  /** Broadcast a live content change; call from the editor's change handler. */
  broadcastEdit: (elementId: string, content: string, isScene: boolean) => void
  /** Report the element/section this client is editing (presence "editing X").
   *  Usually unnecessary — pass `focusId` instead and the hook reports it. */
  reportFocus: (elementId: string, label?: string) => void
  /** Pass to `<RemoteCarets subscribeCarets=...>`. */
  subscribeCarets: (handler: CaretSubscriber) => () => void
  /** Collaborators grouped by the scene/element id each is focused on — the data
   *  behind soft-lock pips. Merges live peers with durable advisory locks (users
   *  who have the project open but aren't connected this instant), deduped by
   *  user so a live session wins over a durable one. */
  peersByElement: Map<string, Peer[]>
}

export function useEditorRealtime({
  projectId,
  userId,
  scenes,
  setScenes,
  surfaceRef,
  focusId,
  focusLabel,
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

  // Report the active scene as this client's focus, so collaborators see
  // "editing X" and the gateway records a durable soft-lock on it. Centralised
  // here so every editor reports focus the same way.
  useEffect(() => {
    if (focusId) setFocus(focusId, focusLabel)
  }, [focusId, focusLabel, setFocus])

  // Durable advisory locks — who has this project open (and where) per the
  // persisted edit sessions. Survives a reconnect, so it seeds the soft-lock
  // markers on open and covers collaborators the live roster hasn't delivered yet.
  const durablePeers = useDurableSessions(projectId)

  // Collaborators keyed by the scene/element they are focused on. Live peers win;
  // durable sessions fill in for anyone not connected right now, deduped by user
  // so nobody shows twice.
  const peersByElement = useMemo(() => {
    const map = new Map<string, Peer[]>()
    const liveUserIds = new Set(peers.map((p) => p.userId))
    const add = (p: Peer) => {
      if (!p.elementId) return
      const list = map.get(p.elementId)
      if (list) list.push(p)
      else map.set(p.elementId, [p])
    }
    for (const p of peers) add(p)
    for (const p of durablePeers) {
      if (!liveUserIds.has(p.userId)) add(p)
    }
    return map
  }, [peers, durablePeers])

  // Current document, read inside the (stable) edit subscriber without making it
  // re-subscribe on every keystroke.
  const scenesRef = useRef(scenes)
  scenesRef.current = scenes

  // Refetch the DB (source of truth) and reconcile, preserving the node the
  // writer is mid-keystroke on. Used on reconnect AND when an edit arrives for
  // an element we don't have yet (a collaborator created it — element adds
  // aren't broadcast). Throttled so a burst of new elements refetches once.
  const lastResyncRef = useRef(0)
  const resyncFromDb = useCallback(async () => {
    if (!userId) return
    const now = Date.now()
    if (now - lastResyncRef.current < RESYNC_THROTTLE_MS) return
    lastResyncRef.current = now
    try {
      const fresh = await getFullProject(projectId, userId)
      const activeDomId =
        typeof document !== "undefined" ? document.activeElement?.id : undefined
      setScenes((prev) => mergeResyncedScenes(prev, fresh.scenes ?? [], activeDomId))
    } catch {
      // A failed refetch leaves local state as-is; the next trigger retries.
      lastResyncRef.current = 0
    }
  }, [projectId, userId, setScenes])

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
      // If the edit targets something we don't have, a collaborator just created
      // it (element/scene adds aren't broadcast) — refetch to pick up the new
      // structure rather than dropping the edit on the floor.
      const current = scenesRef.current
      const exists = edit.isScene
        ? current.some((s) => s.id === edit.elementId)
        : current.some((s) => (s.elements ?? []).some((el) => el.id === edit.elementId))
      if (!exists) {
        void resyncFromDb()
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
  }, [subscribeEdits, setScenes, resyncFromDb])

  // On reconnect we may have missed edits/structure while offline — refetch.
  useEffect(() => {
    return subscribeResync(() => {
      void resyncFromDb()
    })
  }, [subscribeResync, resyncFromDb])

  return { peers, connected, broadcastEdit, reportFocus: setFocus, subscribeCarets, peersByElement }
}
