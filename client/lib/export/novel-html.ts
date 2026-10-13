import { inlineToHtml } from "@/lib/editor/inline-content"
import { novelNumbering, novelReferenceLabel, parseNovelBlock } from "@/lib/editor/novel-blocks"
import type { FullProject, ProjectElement } from "@/services/project"

export type NovelPagePreset = "a6" | "a7"

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
const image = (src: string, alt: string) => /^data:image\/(jpeg|png);base64,[a-z\d+/=]+$/i.test(src) ? `<img src="${src}" alt="${escape(alt)}">` : ""

export function renderNovelHtml(project: FullProject, preset: NovelPagePreset): string {
  const numbers = novelNumbering(project)
  const chapters = [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)
  const body = chapters.map((chapter, index) => {
    const blocks = chapter.elements ?? []
    const html = blocks.map((element: ProjectElement) => {
      const block = parseNovelBlock(element)
      if (block) switch (block.kind) {
        case "figure": return `<figure id="figure-${escape(element.id)}">${image(block.image, block.alt || block.caption)}<figcaption>${escape(numbers.figureLabels.get(element.id) ?? "Fig")}. ${escape(block.caption)}</figcaption></figure>`
        case "step": return `<section class="step"><h3>${escape(numbers.stepLabels.get(element.id) ?? "Step")}${block.title ? `: ${escape(block.title)}` : ""}</h3><p>${escape(block.body).replaceAll("\n", "<br>")}</p>${image(block.image, block.title)}</section>`
        case "materials": return `<section class="materials"><h3>Materials</h3><ul>${lines(block.materials).map(item => `<li>${escape(item)}</li>`).join("")}</ul><h3>Tools</h3><ul>${lines(block.tools).map(item => `<li>${escape(item)}</li>`).join("")}</ul></section>`
        case "callout": return `<aside class="${block.tone}"><strong>${block.tone === "warning" ? "Warning" : "Aside"}</strong><p>${escape(block.body).replaceAll("\n", "<br>")}</p></aside>`
        case "build_card": return `<header class="build-card"><span>Difficulty: ${escape(block.difficulty)}</span><span>Time: ${escape(block.time)}</span><span>Output: ${escape(block.output)}</span></header>`
        case "cross_reference": {
          const label = novelReferenceLabel(block, numbers)
          const valid = label !== "Missing reference"
          const id = block.targetType === "chapter" ? `chapter-${block.targetId}` : `figure-${block.targetId}`
          return valid ? `<p class="cross-reference">See <a href="#${escape(id)}">${escape(label)}</a>.</p>` : `<p class="cross-reference missing">Missing reference</p>`
        }
        case "glossary": return `<section class="glossary"><h3>Glossary</h3><dl>${[...block.entries].filter(entry => entry.term.trim()).sort((a, b) => a.term.localeCompare(b.term)).map(entry => `<dt>${escape(entry.term)}</dt><dd>${escape(entry.definition)}</dd>`).join("")}</dl></section>`
        case "index": {
          const grouped = new Map<string, typeof block.entries>()
          for (const entry of block.entries) {
            if (!entry.term.trim()) continue
            grouped.set(entry.term, [...(grouped.get(entry.term) ?? []), entry])
          }
          const items = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([term, entries]) => {
            const references = entries.map(entry => {
              const label = novelReferenceLabel({ kind: "cross_reference", targetType: entry.targetType, targetId: entry.targetId }, numbers)
              if (label === "Missing reference") return `<span class="missing">Missing reference</span>`
              const target = entry.targetType === "chapter" ? `chapter-${entry.targetId}` : `figure-${entry.targetId}`
              return `<a href="#${escape(target)}">${escape(label)}</a>`
            }).join(", ")
            return `<li><strong>${escape(term)}</strong>: ${references}</li>`
          }).join("")
          return `<section class="index"><h3>Index</h3><ul>${items}</ul></section>`
        }
      }
      const content = inlineToHtml(element.content)
      switch (element.element_type) {
        case "chapter_heading": return `<h3>${content}</h3>`
        case "heading_2": return `<h4>${content}</h4>`
        case "heading_3": return `<h5>${content}</h5>`
        case "scene_break": return `<p class="scene-break">* * *</p>`
        case "scene_heading_stinger": return `<p class="stinger">${content}</p>`
        case "dialogue": return `<blockquote>${content}</blockquote>`
        default: return `<p>${content}</p>`
      }
    }).join("\n")
    return `<section class="chapter" id="chapter-${escape(chapter.id)}"><h2>Chapter ${index + 1}: ${escape(chapter.scene_heading || "Untitled")}</h2>${html}</section>`
  }).join("\n")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(project.title)}</title><style>
@page { size: ${preset.toUpperCase()}; margin: ${preset === "a7" ? "8mm" : "12mm"}; }
body { max-width: 52rem; margin: 2rem auto; padding: 0 1rem; color: #171717; background: #fff; font: 11pt/1.45 Georgia, serif; }
.chapter { break-before: page; } .chapter:first-of-type { break-before: auto; }
h1,h2,h3,h4,h5 { line-height: 1.2; } h1,h2 { text-align: center; }
figure,.step,.materials,.build-card,aside { break-inside: avoid; margin: 1.2em 0; }
.glossary,.index { break-before: page; } .glossary dt { font-weight: bold; margin-top: .5em; } .glossary dd { margin-left: 1em; }
img { display: block; max-width: 100%; height: auto; margin: .5em auto; }
figcaption { font-size: .85em; text-align: center; } .step h3 { margin-bottom: .3em; }
.build-card { display: flex; flex-wrap: wrap; gap: .6em; padding: .7em; border: 1px solid #777; font-size: .85em; }
aside { padding: .6em .8em; border-left: 3px solid #777; background: #f5f5f5; } aside.warning { border-color: #a33; }
.scene-break { text-align: center; } .stinger { font-style: italic; text-transform: uppercase; }
@media print { body { max-width: none; margin: 0; padding: 0; } }
</style></head><body><h1>${escape(project.title)}</h1>${body}</body></html>`
}

export function downloadNovelHtml(project: FullProject, preset: NovelPagePreset): void {
  const blob = new Blob([renderNovelHtml(project, preset)], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "novel"}-${preset}.html`
  anchor.click()
  URL.revokeObjectURL(url)
}
