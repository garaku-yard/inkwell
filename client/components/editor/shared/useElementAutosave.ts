import { useState, useCallback } from "react"
import { useDebouncedCallback } from "use-debounce"

import { updateSceneHeading, updateElementContent } from "@/services/project"

export type SaveStatus = "saved" | "saving" | "unsaved"

interface UseElementAutosaveOptions {
  /** Authenticated user id used as the second arg to the update services.
   *  When undefined, scheduleSave is a no-op — matches the original
   *  per-editor `if (!user?.id) return` guard. */
  userId: string | undefined
  /** Debounce delay before flushing keystrokes to the server. Defaults
   *  to the value used by most format editors (1500ms); Poetry passes
   *  1200ms because lyrics/poem lines are shorter and feel sluggish at
   *  the longer delay. */
  debounceMs?: number
}

interface UseElementAutosaveResult {
  saveStatus: SaveStatus
  /** Schedule a save for `id`. Pass isScene=true to write through
   *  updateSceneHeading; otherwise updateElementContent. The caller
   *  remains responsible for updating its own local scenes/elements
   *  state before calling this — the hook only manages persistence. */
  scheduleSave: (id: string, content: string, isScene: boolean) => void
  /** Flushes any pending debounced save synchronously. Useful before
   *  unmounting the editor or sending a chat that should reflect the
   *  latest content. */
  flushSave: () => void
  /** Sets the status badge to "unsaved" without scheduling a save.
   *  Editors call this when local state diverges from the server (e.g.
   *  on every keystroke before the debounce tick fires). */
  markUnsaved: () => void
}

/** Owns the saveStatus tri-state and a debounced save dispatcher shared
 *  by Prose / Poetry / ComicScript / TabletopRPG / InteractiveFiction
 *  editors. Screenplay's variant is left inline because it tracks an
 *  isSaving boolean instead and routes through different mutators. */
export function useElementAutosave({
  userId,
  debounceMs = 1500,
}: UseElementAutosaveOptions): UseElementAutosaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")

  const debouncedSave = useDebouncedCallback(
    async (id: string, content: string, isScene: boolean) => {
      if (!userId) return
      setSaveStatus("saving")
      try {
        if (isScene) {
          await updateSceneHeading(id, userId, content)
        } else {
          await updateElementContent(id, userId, content)
        }
        setSaveStatus("saved")
      } catch {
        setSaveStatus("unsaved")
      }
    },
    debounceMs,
  )

  const scheduleSave = useCallback(
    (id: string, content: string, isScene: boolean) => {
      setSaveStatus("unsaved")
      debouncedSave(id, content, isScene)
    },
    [debouncedSave],
  )

  const flushSave = useCallback(() => {
    debouncedSave.flush()
  }, [debouncedSave])

  const markUnsaved = useCallback(() => {
    setSaveStatus("unsaved")
  }, [])

  return { saveStatus, scheduleSave, flushSave, markUnsaved }
}
