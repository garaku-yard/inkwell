import type { FullProject } from "@/services/project"
import { inlineToMarkdown, plainInlineText } from "@/lib/editor/inline-content"

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
      const content = plainInlineText(el.content)
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
  const lines: string[] = [`# ${project.title}`, ""]

  for (const scene of project.scenes ?? []) {
    if (scene.scene_heading) lines.push(`## ${scene.scene_heading}`, "")
    for (const el of scene.elements ?? []) {
      if (!plainInlineText(el.content).trim()) continue
      const content = inlineToMarkdown(el.content)
      if (el.element_type === "chapter_heading") {
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

  download(`${slug(project.title)}.md`, lines.join("\n"), "text/markdown")
}

/** Triggers the browser print dialog — works as a basic PDF for any format. */
export function exportProjectViaPrint() {
  window.print()
}
