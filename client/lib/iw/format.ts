/**
 * The `.iw` portable project format — a single, lossless JSON envelope for a
 * non-vault project (everything that lives in SQLite: the project row, its
 * scenes + elements, characters, locations, and the full beat board). Save a
 * project to a `.iw` file to move / share / back it up; open one to recreate the
 * project. SQLite stays the source of truth — `.iw` is import/export, not the
 * store (see PLANNING.md). The build/serialize/parse here are pure so they can be
 * round-trip unit-tested without storage; the I/O lives in lib/export/iw.ts and
 * lib/import/iw.ts.
 */

import type { Character, FullProject, Location } from "@/services/project"
import type { Beat, Connection, Lane, OutlineItem } from "@/lib/storage"

/** Discriminator + schema version written into every `.iw` file. */
export const IW_FORMAT = "inkwell-project"
export const IW_VERSION = 1

/** One scene with its ordered elements (ids/timestamps dropped — recreated on import). */
export interface IwScene {
  heading: string
  content: string
  orderIndex: number
  elements: Array<{
    type: string
    content: string
    lineNumber: number
    formatting: Record<string, string>
  }>
}

/** The full envelope. Beats and lanes keep their ids so connections and outline
 *  items (which reference them) can be remapped to the freshly-created rows on
 *  import; everything else is recreated with new ids. */
export interface IwFile {
  format: typeof IW_FORMAT
  version: number
  exportedAt: string
  project: {
    title: string
    description: string
    category: string
    status: string
    isStarred: boolean
  }
  scenes: IwScene[]
  characters: Array<{ name: string; description: string; role: string; attributes: Record<string, string> }>
  locations: Array<{ name: string; description: string; type: string }>
  beats: Beat[]
  lanes: Lane[]
  connections: Array<{ fromId: string; toId: string; fromSide: string; toSide: string }>
  outlineItems: Array<{ beatId: string; laneId: string; order: number; timelinePosition?: number; width?: number }>
}

/** Inputs for {@link buildIwFile}, gathered by the export I/O layer. */
export interface IwBuildInput {
  project: FullProject
  characters: Character[]
  locations: Location[]
  beats: Beat[]
  lanes: Lane[]
  connections: Connection[]
  outlineItems: OutlineItem[]
  /** ISO timestamp stamped into the envelope (caller supplies the clock). */
  exportedAt: string
}

/** Builds the `.iw` envelope from a project's domain data. Pure. */
export function buildIwFile(i: IwBuildInput): IwFile {
  return {
    format: IW_FORMAT,
    version: IW_VERSION,
    exportedAt: i.exportedAt,
    project: {
      title: i.project.title,
      description: i.project.description ?? "",
      category: i.project.category,
      status: i.project.status,
      isStarred: i.project.is_starred,
    },
    scenes: (i.project.scenes ?? []).map((s) => ({
      heading: s.scene_heading,
      content: s.content,
      orderIndex: s.order_index,
      elements: (s.elements ?? []).map((e) => ({
        type: e.element_type,
        content: e.content,
        lineNumber: e.line_number,
        formatting: e.formatting ?? {},
      })),
    })),
    characters: i.characters.map((c) => ({
      name: c.name,
      description: c.description,
      role: c.role,
      attributes: c.attributes ?? {},
    })),
    locations: i.locations.map((l) => ({ name: l.name, description: l.description, type: l.type })),
    beats: i.beats,
    lanes: i.lanes,
    connections: i.connections.map((c) => ({
      fromId: c.fromId,
      toId: c.toId,
      fromSide: c.fromSide,
      toSide: c.toSide,
    })),
    outlineItems: i.outlineItems.map((o) => ({
      beatId: o.beatId,
      laneId: o.laneId,
      order: o.order,
      timelinePosition: o.timelinePosition,
      width: o.width,
    })),
  }
}

/** Serializes an envelope to pretty JSON. */
export function serializeIw(iw: IwFile): string {
  return JSON.stringify(iw, null, 2)
}

/** Parses + validates a `.iw` file's text. Throws a friendly error when the file
 *  isn't an Inkwell project or was written by a newer schema. Missing optional
 *  arrays are coerced to empty so a partial file still imports. */
export function parseIw(text: string): IwFile {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error("This file isn't valid JSON — it may not be an Inkwell project file.")
  }
  if (!obj || typeof obj !== "object") {
    throw new Error("This file isn't an Inkwell project (.iw) file.")
  }
  const o = obj as Partial<IwFile>
  if (o.format !== IW_FORMAT) {
    throw new Error("This file isn't an Inkwell project (.iw) file.")
  }
  if (typeof o.version !== "number" || o.version > IW_VERSION) {
    throw new Error("This .iw file was made by a newer version of Inkwell. Update to open it.")
  }
  if (!o.project || typeof o.project.category !== "string") {
    throw new Error("This .iw file is missing its project information.")
  }
  return {
    format: IW_FORMAT,
    version: o.version,
    exportedAt: o.exportedAt ?? "",
    project: {
      title: o.project.title ?? "Imported project",
      description: o.project.description ?? "",
      category: o.project.category,
      status: o.project.status ?? "draft",
      isStarred: !!o.project.isStarred,
    },
    scenes: o.scenes ?? [],
    characters: o.characters ?? [],
    locations: o.locations ?? [],
    beats: o.beats ?? [],
    lanes: o.lanes ?? [],
    connections: o.connections ?? [],
    outlineItems: o.outlineItems ?? [],
  }
}
