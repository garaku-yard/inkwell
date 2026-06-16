/** Paragraph-level chunking for vault-as-knowledge embeddings.
 *
 *  Notes are split on blank lines, then greedily packed into chunks no
 *  larger than {@link MAX_CHARS}. A short tail of each chunk is carried into
 *  the next so a sentence that straddles a boundary still appears whole in at
 *  least one chunk (better retrieval recall). Paragraphs longer than the cap
 *  are hard-split into overlapping windows. Pure and deterministic — the unit
 *  tests pin its behaviour. */

/** Soft upper bound on chunk length, in characters. all-MiniLM truncates
 *  around 256 tokens (~1000 chars), so 400 leaves comfortable headroom while
 *  keeping each chunk topically tight. */
export const MAX_CHARS = 400

/** Characters of the previous chunk replayed at the start of the next, so a
 *  passage split across a boundary stays retrievable from both sides. */
export const OVERLAP = 40

/** One embeddable slice of a note. `idx` is the chunk's position within the
 *  note (stable for the `note_embeddings` primary key). */
export interface NoteChunk {
  idx: number
  text: string
}

/** Splits a note's markdown into ordered, overlapping chunks.
 *
 *  @param text - Raw note body (markdown). CRLF is normalised to LF.
 *  @returns Chunks in document order; empty array for blank input. */
export function chunkNote(text: string): NoteChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  // Pre-split any paragraph that alone exceeds the cap into overlapping
  // windows, so the packer below only ever sees cap-sized pieces.
  const pieces: string[] = []
  for (const para of paragraphs) {
    if (para.length <= MAX_CHARS) {
      pieces.push(para)
      continue
    }
    let start = 0
    while (start < para.length) {
      const end = Math.min(start + MAX_CHARS, para.length)
      const slice = para.slice(start, end).trim()
      if (slice) pieces.push(slice)
      if (end >= para.length) break
      start = end - OVERLAP
    }
  }

  // Greedily pack pieces into chunks, carrying an overlap tail across breaks.
  const chunks: NoteChunk[] = []
  let buf = ""
  const flush = () => {
    const t = buf.trim()
    if (t) chunks.push({ idx: chunks.length, text: t })
    buf = ""
  }
  for (const piece of pieces) {
    if (buf && buf.length + piece.length + 2 > MAX_CHARS) {
      const tail = buf.slice(Math.max(0, buf.length - OVERLAP))
      flush()
      buf = tail ? `${tail} ${piece}` : piece
    } else {
      buf = buf ? `${buf}\n\n${piece}` : piece
    }
  }
  flush()
  return chunks
}
