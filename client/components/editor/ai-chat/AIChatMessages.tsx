import { forwardRef } from "react"
import Link from "next/link"
import { AlertCircle, Bot } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import type { ChatMessage } from "./useAIChatStream"

interface AIChatMessagesProps {
  messages: ChatMessage[]
  isTyping: boolean
  showEmptyState: boolean
}

/** The scrollable middle of the chat panel — a warm empty-state prompt,
 *  user/AI/error messages, and a quiet typing indicator. Flat by design: the
 *  assistant carries a small muted monogram for identity (no gradients, rings,
 *  or glow), so the panel has character without breaking the calm register of
 *  the editor canvas. The ref is the bottom anchor for scroll-into-view. */
export const AIChatMessages = forwardRef<HTMLDivElement, AIChatMessagesProps>(
  function AIChatMessages({ messages, isTyping, showEmptyState }, anchorRef) {
    // The stream adds an empty assistant message up front and keeps isTyping
    // true for the whole reply. Show the standalone dots ONLY while we're still
    // waiting for the first token; once text starts streaming, the growing
    // bubble is the indicator — so we never show a text bubble + a dots bubble
    // at once (and we hide the empty placeholder bubble below).
    const last = messages[messages.length - 1]
    const assistantStreaming = last?.type === "ai" && last.content !== "" && !last.error
    const showTyping = isTyping && !assistantStreaming
    return (
      <ScrollArea className="min-h-0 flex-1 p-4">
        {/* aria-live="polite" so screen readers announce assistant replies as
            they stream in without interrupting the user mid-typing.
            atomic=false lets each new chunk be announced on its own. */}
        <div className="space-y-5" aria-live="polite" aria-atomic="false">
          {showEmptyState ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <BuddyMark />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Connect an AI provider</p>
                <p className="text-sm text-muted-foreground">
                  Writing Buddy works with your own OpenAI, Anthropic, or Gemini key.
                </p>
              </div>
              <Link
                href="/settings"
                className="text-sm text-primary underline underline-offset-2"
              >
                Set one up in Settings → AI Providers
              </Link>
            </div>
          ) : (
            messages.map((message) =>
              // Hide the empty assistant placeholder — the dots stand in for it.
              message.type === "ai" && message.content === "" && !message.error ? null : (
                <MessageBubble key={message.id} message={message} />
              ),
            )
          )}
          {showTyping && <TypingIndicator />}
          <div ref={anchorRef} />
        </div>
      </ScrollArea>
    )
  },
)

/** Buddy's identity mark — a flat muted circle, error-tinted when needed. */
function BuddyMark({ error }: { error?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {error ? <AlertCircle className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  )
}

function Timestamp({ at }: { at: Date }) {
  return (
    <span className="px-1 text-[10px] text-muted-foreground/50">
      {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.type === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-line rounded-lg bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
          {message.content}
        </div>
        <Timestamp at={message.timestamp} />
      </div>
    )
  }
  return (
    <div className="flex gap-2.5">
      <BuddyMark error={message.error} />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <div
          className={cn(
            "max-w-full whitespace-pre-line rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
            message.error
              ? "border border-destructive/30 bg-destructive/10 text-destructive"
              : "bg-muted text-foreground",
          )}
        >
          {message.content}
        </div>
        <Timestamp at={message.timestamp} />
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <BuddyMark />
      <div className="rounded-lg bg-muted px-3.5 py-3">
        <div className="flex gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"
              style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
