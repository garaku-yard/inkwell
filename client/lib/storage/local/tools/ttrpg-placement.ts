import type { ProjectElement } from "@/services/project"
import { elements } from "../elements"
import { getDb, markDirty, now } from "../shared"

/** Re-number a section when inserting in the middle. The editor and sync both
 * read line_number, so every shifted row must be marked dirty. */
export async function createPlacedTtrpgElement(
  projectId: string, sectionId: string, elementType: string, content: string,
  existing: ProjectElement[], afterBlockId: string,
): Promise<ProjectElement | string> {
  if (!afterBlockId) {
    const order = existing.length ? existing[existing.length - 1].line_number + 1 : 0
    return elements.create({ projectId, sceneId: sectionId, elementOrder: order, elementType, content })
  }
  const afterIndex = existing.findIndex((item) => item.id === afterBlockId)
  if (afterIndex < 0) return "after_block_id must identify a block in the chosen section."
  const insertAt = afterIndex + 1
  const db = await getDb()
  const timestamp = now()
  for (let index = 0; index < existing.length; index++) {
    const row = existing[index]
    const order = index >= insertAt ? index + 1 : index
    if (row.line_number === order) continue
    await db.execute("UPDATE script_elements SET line_number = ?, updated_at = ? WHERE id = ? AND project_id = ? AND scene_id = ? AND deleted_at IS NULL",
      [order, timestamp, row.id, projectId, sectionId])
    await markDirty(db, "element", projectId, row.id)
  }
  return elements.create({ projectId, sceneId: sectionId, elementOrder: insertAt, elementType, content })
}
