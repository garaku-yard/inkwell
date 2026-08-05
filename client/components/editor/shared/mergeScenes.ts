import type { Scene } from "@/services/project"

/**
 * Folds freshly-loaded scenes into what the editor already has on screen,
 * applying only what is new.
 *
 * The editors seed their scene state once and then own it — every keystroke
 * lives there before autosave persists it. So a refetch must never replace
 * that state: text typed in the last second would vanish. This adds scenes and
 * elements the editor hasn't seen and leaves every existing one exactly as it
 * is, including its content.
 *
 * That is enough because the tools an agent has are additive by construction
 * (ADR 0025, stage 2): nothing it can call deletes or rewrites an element. If
 * a destructive tool is ever added, this merge stops being sufficient and the
 * question of how to reconcile it with in-flight typing has to be answered
 * properly rather than by widening this function.
 *
 * Returns the original array when nothing changed, so React can skip the
 * render.
 */
export function mergeScenes(local: Scene[], incoming: Scene[]): Scene[] {
  const freshById = new Map(incoming.map((scene) => [scene.id, scene]))
  const known = new Set(local.map((scene) => scene.id))

  let touched = false
  const merged = local.map((scene) => {
    const fresh = freshById.get(scene.id)
    if (!fresh) return scene
    const have = new Set((scene.elements ?? []).map((el) => el.id))
    const added = (fresh.elements ?? []).filter((el) => !have.has(el.id))
    if (added.length === 0) return scene
    touched = true
    return { ...scene, elements: [...(scene.elements ?? []), ...added] }
  })

  // New scenes arrive in the order the loader sorted them (order_index), and
  // a tool appends after everything that exists, so tacking them on the end
  // matches where the writer will expect to find them.
  const fresh = incoming.filter((scene) => !known.has(scene.id))
  if (fresh.length === 0) return touched ? merged : local
  return [...merged, ...fresh]
}
