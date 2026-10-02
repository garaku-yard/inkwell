export type TtrpgBlock =
  | { kind: "clock"; name: string; segments: number; filled: number; note: string }
  | { kind: "read_aloud"; text: string; gmNote: string }
  | { kind: "keyed_location"; key: string; name: string; description: string; contents: string }
  | { kind: "cross_reference"; targetId: string; label: string }

export const blockType = (kind: TtrpgBlock["kind"]) => `ttrpg_${kind}`

export function defaultTtrpgBlock(kind: TtrpgBlock["kind"]): TtrpgBlock {
  switch (kind) {
    case "clock": return { kind, name: "Progress", segments: 6, filled: 0, note: "" }
    case "read_aloud": return { kind, text: "", gmNote: "" }
    case "keyed_location": return { kind, key: "1", name: "", description: "", contents: "" }
    case "cross_reference": return { kind, targetId: "", label: "" }
  }
}

export function parseTtrpgBlock(type: string, content: string): TtrpgBlock | null {
  if (!["ttrpg_clock", "ttrpg_read_aloud", "ttrpg_keyed_location", "ttrpg_cross_reference"].includes(type)) return null
  try {
    const raw: unknown = JSON.parse(content)
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const value = raw as Record<string, unknown>
    if (type === "ttrpg_clock" && value.kind === "clock" &&
      typeof value.name === "string" && typeof value.note === "string" &&
      Number.isInteger(value.segments) && Number.isInteger(value.filled) &&
      Number(value.segments) >= 1 && Number(value.segments) <= 24 &&
      Number(value.filled) >= 0 && Number(value.filled) <= Number(value.segments)) return value as TtrpgBlock
    if (type === "ttrpg_read_aloud" && value.kind === "read_aloud" &&
      typeof value.text === "string" && typeof value.gmNote === "string") return value as TtrpgBlock
    if (type === "ttrpg_keyed_location" && value.kind === "keyed_location" &&
      typeof value.key === "string" && typeof value.name === "string" &&
      typeof value.description === "string" && typeof value.contents === "string") return value as TtrpgBlock
    if (type === "ttrpg_cross_reference" && value.kind === "cross_reference" &&
      typeof value.targetId === "string" && typeof value.label === "string") return value as TtrpgBlock
    return null
  } catch { return null }
}

export function ttrpgBlockToText(block: TtrpgBlock, targetName?: string): string {
  switch (block.kind) {
    case "clock": return `${block.name} (${block.filled}/${block.segments})${block.note ? `\n${block.note}` : ""}`
    case "read_aloud": return `Read aloud: ${block.text}${block.gmNote ? `\nGM note: ${block.gmNote}` : ""}`
    case "keyed_location": return `${block.key}. ${block.name}${block.description ? `\n${block.description}` : ""}${block.contents ? `\nFound here: ${block.contents}` : ""}`
    case "cross_reference": return `See: ${targetName || block.label || "Missing target"}`
  }
}
