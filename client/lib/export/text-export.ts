import type { FullProject, ProjectElement } from "@/services/project"
import { inlineToMarkdown, plainInlineText } from "@/lib/editor/inline-content"
import { parseStatInstance, statInstanceToText } from "@/lib/ttrpg/stat-schemas"
import { parseTtrpgBlock, ttrpgBlockToText } from "@/lib/ttrpg/blocks"

function elementText(project: FullProject, el: ProjectElement): string {
  if (el.element_type === "ttrpg_stat") {
    const instance = parseStatInstance(el.content)
    if (instance) return statInstanceToText(instance, project.ttrpg_stat_schemas?.find((schema) => schema.id === instance.schemaId))
  }
  const block = parseTtrpgBlock(el.element_type, el.content)
  if (block) {
    const target = block.kind === "cross_reference" && (!block.targetProjectId || block.targetProjectId === project.id)
      ? project.scenes?.flatMap((scene) => scene.elements ?? []).find((item) => item.id === block.targetId)
      : undefined
    const targetStat = target?.element_type === "ttrpg_stat" ? parseStatInstance(target.content) : null
    const targetBlock = target ? parseTtrpgBlock(target.element_type, target.content) : null
    const targetName = targetStat?.name || (targetBlock ? ttrpgBlockToText(targetBlock).split("\n")[0] : target?.content.slice(0, 60))
    return ttrpgBlockToText(block, targetName)
  }
  return plainInlineText(el.content)
}

/** Downloads a string as a file. */
function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** Serialises any project to a plain-text document. */
export function exportProjectToText(project: FullProject) {
  if (project.category === "poetry") {
    download(`${slug(project.title)}.txt`, projectToVerseText(project))
    return
  }
  const lines: string[] = [project.title, "=".repeat(project.title.length), ""]

  for (const scene of project.scenes ?? []) {
    if (scene.scene_heading) {
      lines.push(scene.scene_heading)
      lines.push("-".repeat(scene.scene_heading.length))
    }
    for (const el of scene.elements ?? []) {
      const content = elementText(project, el)
      if (!content.trim()) continue
      lines.push(content)
      lines.push("")
    }
    lines.push("")
  }

  download(`${slug(project.title)}.txt`, lines.join("\n"))
}

/** A readable poem text file with explicit boundaries only for collections. */
export function projectToVerseText(project: FullProject): string {
  const scenes = [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)
  return scenes.map((scene) => {
    const lines = [...(scene.elements ?? [])].sort((a, b) => a.line_number - b.line_number).map((el) =>
      el.element_type === "stanza_break" ? "" : plainInlineText(el.content),
    )
    return `${scenes.length > 1 ? `:::inkwell-poem ${JSON.stringify(scene.scene_heading)}\n` : ""}${lines.join("\n")}`
  }).join("\n\n")
}

/** Exports a prose project as a Markdown document. */
export function exportProjectToMarkdown(project: FullProject) {
  download(`${slug(project.title)}.md`, projectToMarkdown(project), "text/markdown")
}

/** Shared serializer for file export and MCP text results. */
export function projectToMarkdown(project: FullProject, sectionId?: string): string {
  const lines: string[] = sectionId ? [] : [`# ${project.title}`, ""]

  for (const scene of project.scenes ?? []) {
    if (sectionId && scene.id !== sectionId) continue
    if (scene.scene_heading) lines.push(`## ${scene.scene_heading}`, "")
    for (const el of scene.elements ?? []) {
      if (!elementText(project, el).trim()) continue
      const content = el.element_type.startsWith("ttrpg_") ? elementText(project, el) : inlineToMarkdown(el.content)
      if (el.element_type === "h2" || el.element_type === "chapter_heading") {
        lines.push(`### ${content}`, "")
      } else if (el.element_type === "heading_2") {
        lines.push(`#### ${content}`, "")
      } else if (el.element_type === "heading_3") {
        lines.push(`##### ${content}`, "")
      } else if (el.element_type === "scene_break") {
        lines.push("---", "")
      } else {
        lines.push(content, "")
      }
    }
  }

  return lines.join("\n")
}

/** Triggers the browser print dialog — works as a basic PDF for any format. */
export function exportProjectViaPrint() {
  window.print()
}
