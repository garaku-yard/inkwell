export type ProsePaperSize = "a4" | "a5" | "a6" | "a7" | "letter"

export const PROSE_PAPER: Record<ProsePaperSize, { label: string; widthMm: number; heightMm: number; marginMm: number }> = {
  a4: { label: "A4", widthMm: 210, heightMm: 297, marginMm: 21 },
  a5: { label: "A5", widthMm: 148, heightMm: 210, marginMm: 16 },
  a6: { label: "A6", widthMm: 105, heightMm: 148, marginMm: 12 },
  a7: { label: "A7", widthMm: 74, heightMm: 105, marginMm: 8 },
  letter: { label: "US Letter", widthMm: 215.9, heightMm: 279.4, marginMm: 25.4 },
}

export function isProsePaperSize(value: string | null): value is ProsePaperSize {
  return value !== null && Object.hasOwn(PROSE_PAPER, value)
}
