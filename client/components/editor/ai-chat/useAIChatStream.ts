import type React from "react"
import { useCallback, useEffect, useRef } from "react"

import type { AIProviderSettings } from "@/lib/storage"
import { decideHostedToolApproval, streamChatCompletion } from "@/services/ai"

import { friendlyChatError } from "./errors"
import { editorUnitNoun } from "./editorUnit"

export interface ChatMessage {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
  /** True when this bubble is reporting a chat failure rather than
   *  carrying a real assistant reply. Renders with destructive styling
   *  and an error icon so users don't mistake it for a model output. */
  error?: boolean
  activities?: string[]
  approval?: {
    checkpointId: string
    tool: string
    arguments: Record<string, unknown>
    status: "pending" | "approving" | "approved" | "denied" | "failed"
  }
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
  activeUnitId?: string
  category?: string
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void
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
  decideApproval: (messageId: string, checkpointId: string, tool: string, args: Record<string, unknown>, decision: "approve" | "deny") => Promise<void>
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
  activeUnitId,
  category,
  onToolComplete,
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

  const decideApproval = useCallback(async (messageId: string, checkpointId: string, tool: string, args: Record<string, unknown>, decision: "approve" | "deny") => {
    if (!projectId) return
    setMessages((current) => current.map((item) => item.id === messageId && item.approval
      ? { ...item, approval: { ...item.approval, status: "approving" } }
      : item))
    try {
      await decideHostedToolApproval(checkpointId, projectId, decision)
      setMessages((current) => current.map((item) => item.id === messageId && item.approval
        ? { ...item, approval: { ...item.approval, status: decision === "approve" ? "approved" : "denied" } }
        : item))
      if (decision === "approve") onToolComplete?.(tool, args)
    } catch (error) {
      const message = error instanceof Error ? error.message : "The proposed change could not be applied."
      setMessages((current) => current.map((item) => item.id === messageId && item.approval
        ? { ...item, content: `Couldn't apply this proposal: ${message}`, error: true, approval: { ...item.approval, status: "failed" } }
        : item))
    }
  }, [projectId, setMessages, onToolComplete])

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
          activeUnitId,
          category,
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
              approval_required?: {
                checkpoint_id: string
                tool: string
                arguments: Record<string, unknown>
              }
              arguments?: Record<string, unknown>
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
              const doing = friendlyToolLabel(parsed.tool, category, parsed.label)
              setMessages((currentMessages) =>
                currentMessages.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, activities: [...(msg.activities ?? []), doing] }
                    : msg,
                ),
              )
              onToolComplete?.(parsed.tool, parsed.arguments ?? {})
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
            if (parsed.approval_required) {
              const approval = parsed.approval_required
              setMessages((currentMessages) =>
                currentMessages.map((msg) => msg.id === aiMessageId
                  ? {
                      ...msg,
                      content: msg.content || "This change needs your approval.",
                      approval: {
                        checkpointId: approval.checkpoint_id,
                        tool: approval.tool,
                        arguments: approval.arguments,
                        status: "pending",
                      },
                    }
                  : msg),
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
    [selectedProvider, setMessages, setIsTyping, isTyping, projectId, activeUnitId, category, onToolComplete],
  )

  return { sendMessage, stop, decideApproval }
}

function friendlyToolLabel(tool: string, category?: string, serverLabel?: string): string {
  const noun = editorUnitNoun(category)
  const labels: Record<string, string> = {
    list_scenes: `Checking ${noun}s`,
    read_scene: `Reading ${noun}`,
    create_scene: `Creating ${noun}`,
    append_to_scene: `Writing to ${noun}`,
    rename_scene: `Renaming ${noun}`,
    rewrite_scene: `Replacing ${noun}`,
    delete_scene: `Deleting ${noun}`,
    list_units: `Checking ${noun}s`,
    read_unit: `Reading ${noun}`,
    create_unit: `Creating ${noun}`,
    append_to_unit: `Writing to ${noun}`,
    rename_unit: `Renaming ${noun}`,
    rewrite_unit: `Replacing ${noun}`,
    delete_unit: `Deleting ${noun}`,
    add_beat: "Adding story beat",
    list_projects: "Checking projects",
    create_project: "Creating project",
  }
  return labels[tool] ?? (serverLabel && serverLabel !== tool ? serverLabel : "Working")
}
