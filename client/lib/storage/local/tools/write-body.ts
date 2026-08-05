import { elements } from "../elements"
import { LOCAL_USER_ID } from "../shared"
import type { FormatShape } from "./formats"
import { splitBody } from "./formats"

/** Appends written text to a scene as elements of the format's body type,
 *  after whatever is already there.
 *
 *  Append-only on purpose: nothing here deletes or overwrites an existing
 *  element, so the worst a confused model can do to a scene is add to it —
 *  visible in the editor, and undone by deleting what it added. Replacing a
 *  scene's text wholesale is a different proposition and is not built yet
 *  (ADR 0025 puts confirmation semantics in stage 4).
 *
 *  Returns how many elements were written. */
export async function appendBody(
  projectId: string,
  sceneId: string,
  text: string,
  shape: FormatShape,
): Promise<number> {
  const parts = splitBody(text, shape)
  if (parts.length === 0) return 0

  // Continue the scene's own numbering rather than counting rows: line
  // numbers need not be contiguous once elements have been deleted.
  const existing = await elements.listForScene(sceneId, LOCAL_USER_ID)
  const last = existing[existing.length - 1]
  let order = last ? last.line_number + 1 : 0

  for (const content of parts) {
    await elements.create({
      projectId,
      sceneId,
      elementOrder: order,
      elementType: shape.body,
      content,
    })
    order += 1
  }
  return parts.length
}
