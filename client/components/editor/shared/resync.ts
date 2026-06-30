import type { Scene } from "@/services/project"

/**
 * Reconcile freshly-fetched passages (the DB's truth, after a reconnect) with
 * the editor's local state, preserving only the element or heading the writer
 * is *actively editing* so a resync never yanks their caret or discards
 * keystrokes that haven't autosaved yet.
 *
 * The fresh list wins on everything else: it picks up passages and elements
 * changed (or created/deleted) by collaborators while we were offline. The
 * actively-edited node is identified by the DOM id under the caret —
 * `el-{elementId}` for a body element, `head-{passageId}` for a passage
 * heading — which the editor reads from `document.activeElement` at resync time.
 *
 * @param prev - the editor's current passages
 * @param fresh - passages just fetched from the server
 * @param activeDomId - id of the focused contentEditable, or null/empty if none
 * @returns the merged passages to set as the new editor state
 */
export function mergeResyncedScenes(
  prev: Scene[],
  fresh: Scene[],
  activeDomId: string | null | undefined,
): Scene[] {
  const prevById = new Map(prev.map((p) => [p.id, p]))
  const active = activeDomId ?? ""

  return fresh.map((fs) => {
    const ps = prevById.get(fs.id)

    // Keep the heading the writer is typing into.
    const scene_heading =
      ps && active === `head-${fs.id}` ? ps.scene_heading : fs.scene_heading

    // Keep the content of the body element the writer is typing into.
    const prevElements = new Map((ps?.elements ?? []).map((e) => [e.id, e]))
    const elements = (fs.elements ?? []).map((fe) => {
      const pe = prevElements.get(fe.id)
      return pe && active === `el-${fe.id}` ? { ...fe, content: pe.content } : fe
    })

    return { ...fs, scene_heading, elements }
  })
}
