import type { FullProject, ProjectElement } from "@/services/project"

export type NovelBlock =
  | { kind: "figure"; caption: string; alt: string; image: string }
  | { kind: "step"; title: string; body: string; image: string }
  | { kind: "materials"; materials: string; tools: string }
  | { kind: "callout"; tone: "warning" | "aside"; body: string }
  | { kind: "build_card"; difficulty: string; time: string; output: string }
  | { kind: "cross_reference"; targetType: "chapter" | "figure"; targetId: string }
  | { kind: "glossary"; entries: { term: string; definition: string }[] }
  | { kind: "index"; entries: { term: string; targetType: "chapter" | "figure"; targetId: string }[] }

export type NovelBlockKind = NovelBlock["kind"]
export const NOVEL_BLOCK_KINDS: NovelBlockKind[] = ["figure", "step", "materials", "callout", "build_card", "cross_reference", "glossary", "index"]

export function defaultNovelBlock(kind: NovelBlockKind): NovelBlock {
  switch (kind) {
    case "figure": return { kind, caption: "", alt: "", image: "" }
    case "step": return { kind, title: "", body: "", image: "" }
    case "materials": return { kind, materials: "", tools: "" }
    case "callout": return { kind, tone: "warning", body: "" }
    case "build_card": return { kind, difficulty: "", time: "", output: "" }
    case "cross_reference": return { kind, targetType: "chapter", targetId: "" }
    case "glossary": return { kind, entries: [] }
    case "index": return { kind, entries: [] }
  }
}

export function parseNovelBlock(element: ProjectElement): NovelBlock | null {
  if (!NOVEL_BLOCK_KINDS.includes(element.element_type as NovelBlockKind)) return null
  try {
    const value: unknown = JSON.parse(element.content)
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const source = value as Record<string, unknown>
    if (source.kind !== element.element_type) return null
    const base = defaultNovelBlock(element.element_type as NovelBlockKind)
    const safe = (key: string) => typeof source[key] === "string" ? source[key] as string : ""
    switch (base.kind) {
      case "figure": return { ...base, caption: safe("caption"), alt: safe("alt"), image: safe("image") }
      case "step": return { ...base, title: safe("title"), body: safe("body"), image: safe("image") }
      case "materials": return { ...base, materials: safe("materials"), tools: safe("tools") }
      case "callout": return { ...base, tone: source.tone === "aside" ? "aside" : "warning", body: safe("body") }
      case "build_card": return { ...base, difficulty: safe("difficulty"), time: safe("time"), output: safe("output") }
      case "cross_reference": return { ...base, targetType: source.targetType === "figure" ? "figure" : "chapter", targetId: safe("targetId") }
      case "glossary": return { ...base, entries: Array.isArray(source.entries) ? source.entries.flatMap(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return []
        const entry = item as Record<string, unknown>
        return typeof entry.term === "string" && typeof entry.definition === "string" ? [{ term: entry.term, definition: entry.definition }] : []
      }) : [] }
      case "index": return { ...base, entries: Array.isArray(source.entries) ? source.entries.flatMap(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return []
        const entry = item as Record<string, unknown>
        return typeof entry.term === "string" && typeof entry.targetId === "string" && (entry.targetType === "chapter" || entry.targetType === "figure")
          ? [{ term: entry.term, targetType: entry.targetType as "chapter" | "figure", targetId: entry.targetId }] : []
      }) : [] }
    }
  } catch { return null }
}

export function novelNumbering(project: FullProject) {
  const chapters = [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)
  const chapterLabels = new Map<string, string>()
  const figureLabels = new Map<string, string>()
  const stepLabels = new Map<string, string>()
  for (const [chapterIndex, chapter] of chapters.entries()) {
    chapterLabels.set(chapter.id, `Chapter ${chapterIndex + 1}${chapter.scene_heading ? ` — ${chapter.scene_heading}` : ""}`)
    let figure = 0
    let step = 0
    for (const element of chapter.elements ?? []) {
      if (element.element_type === "figure") figureLabels.set(element.id, `Fig ${chapterIndex + 1}.${++figure}`)
      if (element.element_type === "step") stepLabels.set(element.id, `Step ${++step}`)
    }
  }
  return { chapterLabels, figureLabels, stepLabels }
}

export function novelBlockText(block: NovelBlock, label?: string, numbers?: ReturnType<typeof novelNumbering>): string {
  switch (block.kind) {
    case "figure": return `${label ?? "Figure"}: ${block.caption}`
    case "step": return `${label ?? "Step"}${block.title ? `: ${block.title}` : ""}\n${block.body}`
    case "materials": return `Materials:\n${block.materials}\nTools:\n${block.tools}`
    case "callout": return `${block.tone === "warning" ? "Warning" : "Aside"}: ${block.body}`
    case "build_card": return `Difficulty: ${block.difficulty} | Time: ${block.time} | Output: ${block.output}`
    case "cross_reference": return label ?? "Missing reference"
    case "glossary": return `Glossary\n${block.entries.map(entry => `${entry.term}: ${entry.definition}`).join("\n")}`
    case "index": return `Index\n${block.entries.map(entry => `${entry.term}: ${numbers ? novelReferenceLabel({ kind: "cross_reference", targetType: entry.targetType, targetId: entry.targetId }, numbers) : entry.targetId}`).join("\n")}`
  }
}

export function novelReferenceLabel(block: Extract<NovelBlock, { kind: "cross_reference" }>, numbers: ReturnType<typeof novelNumbering>) {
  return (block.targetType === "chapter" ? numbers.chapterLabels : numbers.figureLabels).get(block.targetId) ?? "Missing reference"
}
