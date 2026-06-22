/**
 * Recreates a `.iw` file (see lib/iw/format) as a fresh project. Every row gets
 * a new id; beat/lane ids are remapped so connections and outline items wire up
 * to the newly-created beats/lanes. Sequential by necessity (children need their
 * parent's id first). Errors propagate — a partial project may remain but is
 * recoverable from the project list.
 */

import { createBeat, createConnection } from "@/services/beat"
import { createLane, createOutlineItem } from "@/services/beat-board"
import {
  createCharacter,
  createLocation,
  createProject,
  createScene,
  createSceneElement,
  type Project,
} from "@/services/project"
import type { Connection } from "@/lib/storage"
import type { IwFile } from "@/lib/iw/format"

/** Persists `iw` as a brand-new project owned by `userId`; returns it so the
 *  caller can navigate to its editor. */
export async function importIwAsProject(iw: IwFile, userId: string): Promise<Project> {
  const project = await createProject({
    title: iw.project.title || "Imported project",
    description: iw.project.description,
    owner_id: userId,
    category: iw.project.category as Project["category"],
  })

  // Scenes + their elements.
  for (const s of iw.scenes) {
    const scene = await createScene(project.id, userId, {
      scene_heading: s.heading,
      content: s.content,
      order_index: s.orderIndex,
    })
    for (const e of s.elements) {
      await createSceneElement(project.id, scene.id, userId, {
        element_type: e.type,
        content: e.content,
        order_index: e.lineNumber,
      })
    }
  }

  for (const c of iw.characters) {
    await createCharacter(project.id, userId, {
      name: c.name,
      description: c.description,
      role: c.role,
      attributes: c.attributes,
    })
  }
  for (const l of iw.locations) {
    await createLocation(project.id, userId, { name: l.name, description: l.description, type: l.type })
  }

  // Beats + lanes, remembering old→new ids so the references below resolve.
  const beatIds = new Map<string, string>()
  for (const b of iw.beats) {
    const created = await createBeat(project.id, {
      title: b.title,
      description: b.description,
      sceneNumbers: b.sceneNumbers,
      color: b.color,
      position: b.position,
      width: b.width,
      height: b.height,
      act: b.act,
      order: b.order,
      startPage: b.startPage,
      endPage: b.endPage,
      imageUrl: b.imageUrl,
    })
    beatIds.set(b.id, created.id)
  }
  const laneIds = new Map<string, string>()
  for (const ln of iw.lanes) {
    const created = await createLane(project.id, { name: ln.name, color: ln.color, order: ln.order })
    laneIds.set(ln.id, created.id)
  }

  // Connections + outline items, remapped onto the new beat/lane ids. Skip any
  // whose endpoints didn't come through (defensive against a malformed file).
  for (const cn of iw.connections) {
    const fromId = beatIds.get(cn.fromId)
    const toId = beatIds.get(cn.toId)
    if (!fromId || !toId) continue
    await createConnection(project.id, {
      fromId,
      toId,
      fromSide: cn.fromSide as Connection["fromSide"],
      toSide: cn.toSide as Connection["toSide"],
    })
  }
  for (const oi of iw.outlineItems) {
    const beatId = beatIds.get(oi.beatId)
    const laneId = laneIds.get(oi.laneId)
    if (!beatId || !laneId) continue
    await createOutlineItem(project.id, {
      beatId,
      laneId,
      order: oi.order,
      timelinePosition: oi.timelinePosition,
      width: oi.width,
    })
  }

  return project
}
