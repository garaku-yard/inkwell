/** Minimal Server-Sent Events parser used by the provider adapters.
 *
 *  Framing per the HTML Living Standard: each line is `field:value`,
 *  terminated by `\n` (or `\r\n`). An empty line terminates the current
 *  event and dispatches it. Lines beginning with `:` are comments and
 *  ignored. We only read the `event` and `data` fields — `id` and `retry`
 *  are never used by OpenAI, Anthropic, or Gemini and are dropped.
 *
 *  Multi-line `data` fields are joined with `\n` per spec. An event with
 *  neither `event` nor `data` is suppressed. */

export interface SSEEvent {
  /** The `event:` field, if present. OpenAI never sets this (all events are
   *  untyped); Anthropic uses it to name lifecycle events
   *  (`message_start`, `content_block_delta`, …). */
  event?: string
  /** The concatenated `data:` field(s) for the event, joined by `\n`. */
  data: string
}

/** Parses a `ReadableStream` of bytes as an SSE event stream. Yields one
 *  `SSEEvent` per complete event. Consumes the full body; callers that
 *  want to cancel mid-stream should abort the underlying fetch. */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent: string | undefined
  let currentData: string[] = []

  const flush = (): SSEEvent | null => {
    if (currentData.length === 0 && currentEvent === undefined) return null
    const ev: SSEEvent = { data: currentData.join("\n") }
    if (currentEvent !== undefined) ev.event = currentEvent
    currentEvent = undefined
    currentData = []
    return ev
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        if (buffer.length > 0) buffer += "\n"
      } else {
        buffer += decoder.decode(value, { stream: true })
      }

      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, newlineIdx)
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
        buffer = buffer.slice(newlineIdx + 1)

        if (line === "") {
          const ev = flush()
          if (ev) yield ev
          continue
        }
        if (line.startsWith(":")) continue

        const colonIdx = line.indexOf(":")
        const field = colonIdx === -1 ? line : line.slice(0, colonIdx)
        let value = colonIdx === -1 ? "" : line.slice(colonIdx + 1)
        if (value.startsWith(" ")) value = value.slice(1)

        if (field === "event") currentEvent = value
        else if (field === "data") currentData.push(value)
      }

      if (done) {
        const ev = flush()
        if (ev) yield ev
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}
