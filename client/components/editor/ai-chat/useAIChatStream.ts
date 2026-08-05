import type React from "react"
import { useCallback, useEffect, useRef } from "react"

import type { AIProviderSettings } from "@/lib/storage"
import { streamChatCompletion } from "@/services/ai"

import { friendlyChatError } from "./errors"

export interface ChatMessage {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
  /** True when this bubble is reporting a chat failure rather than
   *  carrying a real assistant reply. Renders with destructive styling
   *  and an error icon so users don't mistake it for a model output. */
  error?: boolean
}

interface UseAIChatStreamOptions {
  selectedProvider: AIProviderSettings | null
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setIsTyping: React.Dispatch<React.SetStateAction<boolean>>
  isTyping: boolean
  /** The project this chat belongs to. Passed through so the desktop
   *  storage layer can retrieve vault-as-knowledge context for the prompt
   *  and run the `read_note` tool. Undefined on surfaces without a project. */
  projectId?: string
}

interface UseAIChatStreamResult {
  /** Sends `content` as a new user turn and streams the assistant's
   *  reply into setMessages. The caller passes its current messages
   *  list so the request payload includes prior turns; the hook can't
   *  read parent state directly and we don't want to mirror it. */
  sendMessage: (content: string, history: ChatMessage[]) => Promise<void>
  /** Aborts the in-flight stream, leaving any partial response in
   *  place. No-op when nothing is streaming. */
  stop: () => void
}

/** Owns the streaming chat dispatch — NDJSON parsing, AbortController
 *  bookkeeping, mid-stream {error} handling, and the unified failure
 *  rendering path. Doesn't own the messages list itself; the parent
 *  keeps that and feeds setMessages in. */
export function useAIChatStream({
  selectedProvider,
  setMessages,
  setIsTyping,
  isTyping,
  projectId,
}: UseAIChatStreamOptions): UseAIChatStreamResult {
  const abortRef = useRef<AbortController | null>(null)

  // Cancel any in-flight stream when the panel unmounts so we don't
  // keep burning tokens / bandwidth after the user has moved on.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const sendMessage = useCallback(
    async (content: string, history: ChatMessage[]) => {
      if (!content.trim() || isTyping) return
      if (!selectedProvider) return

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content: content.trim(),
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])
      setIsTyping(true)

      const aiMessageId = (Date.now() + 1).toString()
      setMessages((prev) => [
        ...prev,
        { id: aiMessageId, type: "ai", content: "", timestamp: new Date() },
      ])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const request = {
          messages: [...history, userMessage].map((msg) => ({
            role: (msg.type === "user" ? "user" : "assistant") as "user" | "assistant",
            content: msg.content,
          })),
          providerId: selectedProvider.id,
          model: selectedProvider.defaultModel,
          stream: true,
          projectId,
        }

        const stream = await streamChatCompletion(request, { signal: controller.signal })
        if (!stream) throw new Error("Stream is null")

        const reader = stream.getReader()
        const decoder = new TextDecoder()

        let streamErrorMessage: string | null = null

        const handleLine = (line: string) => {
          if (line.trim() === "") return
          try {
            const parsed = JSON.parse(line) as {
              response?: string
              done?: boolean
              error?: string
              tool?: string
              label?: string
            }
            if (parsed.error) {
              // Gateway emits {error} as the final NDJSON line when
              // the upstream provider drops mid-stream. Capture and
              // let the outer catch render it; partial response stays
              // visible.
              streamErrorMessage = parsed.error
            }
            if (parsed.tool) {
              // The desktop tool loop surfaces each call so the reader can
              // see the model consult their work rather than watch a pause.
              // The phrase is the tool's own — the panel renders whatever
              // arrives, so a new tool needs no change here.
              const doing = parsed.label || "Working"
              setMessages((currentMessages) =>
                currentMessages.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, content: `${msg.content}\n\n_📄 ${doing}…_\n\n` }
                    : msg,
                ),
              )
            }
            if (parsed.response) {
              setMessages((currentMessages) =>
                currentMessages.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, content: msg.content + parsed.response }
                    : msg,
                ),
              )
            }
          } catch {
            // Non-JSON line — ignore; upstream parsers can emit framing bytes.
          }
        }

        // NDJSON lines can be split across network/decoder chunk boundaries
        // (and multi-byte UTF-8 can split mid-character), so buffer across
        // reads: decode in streaming mode, dispatch only complete lines, and
        // carry the trailing partial into the next read.
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          let newlineIdx: number
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            handleLine(buffer.slice(0, newlineIdx))
            buffer = buffer.slice(newlineIdx + 1)
          }
        }
        // Flush any decoder state and process a final unterminated line.
        buffer += decoder.decode()
        handleLine(buffer)

        if (streamErrorMessage) {
          // Throw to take the unified error-rendering path below.
          throw new Error(streamErrorMessage)
        }
      } catch (error) {
        // Aborts are user-initiated — leave whatever partial response
        // arrived in place rather than overwriting it with an error.
        const aborted =
          (error instanceof DOMException && error.name === "AbortError") ||
          controller.signal.aborted
        if (!aborted) {
          const message = friendlyChatError(error)
          setMessages((prev) => {
            const target = prev.find((m) => m.id === aiMessageId)
            // If the stream produced no text before failing, replace
            // the empty AI bubble with an error bubble. If it produced
            // partial text, append a separate error bubble so the
            // partial reply stays visible.
            if (target && target.content === "") {
              return prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, content: message, error: true }
                  : msg,
              )
            }
            return [
              ...prev,
              {
                id: `${aiMessageId}-err`,
                type: "ai",
                content: message,
                timestamp: new Date(),
                error: true,
              },
            ]
          })
        }
      } finally {
        setIsTyping(false)
        abortRef.current = null
      }
    },
    [selectedProvider, setMessages, setIsTyping, isTyping, projectId],
  )

  return { sendMessage, stop }
}
