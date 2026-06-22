/**
 * Exports a non-vault project to a portable `.iw` file (see lib/iw/format).
 * Reads the whole project through the storage services (so it works on both the
 * desktop and web builds) and triggers a browser download.
 */

import { getBeatBoardForProject } from "@/services/beat"
import { getFullProject, getProjectCharacters, getProjectLocations } from "@/services/project"
import { buildIwFile, serializeIw } from "@/lib/iw/format"

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slug(title: string) {
  return title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "project"
}

/** Reads `projectId` in full and downloads it as `<title>.iw`. */
export async function exportProjectToIw(projectId: string, userId: string): Promise<void> {
  const [project, characters, locations, board] = await Promise.all([
    getFullProject(projectId, userId),
    getProjectCharacters(projectId, userId),
    getProjectLocations(projectId, userId),
    getBeatBoardForProject(projectId),
  ])
  const iw = buildIwFile({
    project,
    characters,
    locations,
    beats: board.beats,
    lanes: board.lanes,
    connections: board.connections,
    outlineItems: board.outlineItems,
    exportedAt: new Date().toISOString(),
  })
  download(`${slug(project.title)}.iw`, serializeIw(iw))
}
