import type { FullProject } from "@/services/project"

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
  const lines: string[] = [project.title, "=".repeat(project.title.length), ""]

  for (const scene of project.scenes ?? []) {
    if (scene.scene_heading) {
      lines.push(scene.scene_heading)
      lines.push("-".repeat(scene.scene_heading.length))
    }
    for (const el of scene.elements ?? []) {
      if (!el.content.trim()) continue
      lines.push(el.content)
      lines.push("")
    }
    lines.push("")
  }

  download(`${slug(project.title)}.txt`, lines.join("\n"))
}

/** Exports a prose project as a Markdown document. */
export function exportProjectToMarkdown(project: FullProject) {
  const lines: string[] = [`# ${project.title}`, ""]

  for (const scene of project.scenes ?? []) {
    if (scene.scene_heading) lines.push(`## ${scene.scene_heading}`, "")
    for (const el of scene.elements ?? []) {
      if (!el.content.trim()) continue
      if (el.element_type === "chapter_heading") {
        lines.push(`### ${el.content}`, "")
      } else if (el.element_type === "scene_break") {
        lines.push("---", "")
      } else {
        lines.push(el.content, "")
      }
    }
  }

  download(`${slug(project.title)}.md`, lines.join("\n"), "text/markdown")
}

/** Triggers the browser print dialog — works as a basic PDF for any format. */
export function exportProjectViaPrint() {
  window.print()
}
