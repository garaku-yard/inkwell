import { forwardRef } from "react"
import Link from "next/link"
import { AlertCircle, Bot, Check } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import type { ChatMessage } from "./useAIChatStream"

interface AIChatMessagesProps {
  messages: ChatMessage[]
  isTyping: boolean
  showEmptyState: boolean
  onApprovalDecision: (messageId: string, checkpointId: string, tool: string, args: Record<string, unknown>, decision: "approve" | "deny") => void
  category?: string
}

/** The scrollable middle of the chat panel — a warm empty-state prompt,
 *  user/AI/error messages, and a quiet typing indicator. Flat by design: the
 *  assistant carries a small muted monogram for identity (no gradients, rings,
 *  or glow), so the panel has character without breaking the calm register of
 *  the editor canvas. The ref is the bottom anchor for scroll-into-view. */
export const AIChatMessages = forwardRef<HTMLDivElement, AIChatMessagesProps>(
  function AIChatMessages({ messages, isTyping, showEmptyState, onApprovalDecision, category }, anchorRef) {
    // The stream adds an empty assistant message up front and keeps isTyping
    // true for the whole reply. Show the standalone dots ONLY while we're still
    // waiting for the first token; once text starts streaming, the growing
    // bubble is the indicator — so we never show a text bubble + a dots bubble
    // at once (and we hide the empty placeholder bubble below).
    const last = messages[messages.length - 1]
    const assistantStreaming = last?.type === "ai" && (last.content !== "" || Boolean(last.activities?.length)) && !last.error
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
              message.type === "ai" && message.content === "" && !message.error && !message.activities?.length ? null : (
                <MessageBubble key={message.id} message={message} category={category} onApprovalDecision={onApprovalDecision} />
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

function MessageBubble({ message, onApprovalDecision, category }: { message: ChatMessage; onApprovalDecision: AIChatMessagesProps["onApprovalDecision"]; category?: string }) {
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
        {message.activities?.map((activity, index) => (
          <div key={`${activity}-${index}`} className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            <Check className="h-3 w-3 text-primary" />
            <span>{activity}</span>
          </div>
        ))}
        {(message.content !== "" || message.error || message.approval) && (
        <div
          className={cn(
            "max-w-full whitespace-pre-line rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
            message.error
              ? "border border-destructive/30 bg-destructive/10 text-destructive"
              : "bg-muted text-foreground",
          )}
        >
          {message.content}
          {message.approval && (
            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {approvalLabel(message.approval.tool, category)}: {approvalSummary(message.approval.arguments)}
              </p>
              {message.approval.status === "pending" ? (
                <div className="flex gap-2">
                  <button className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground" onClick={() => onApprovalDecision(message.id, message.approval!.checkpointId, message.approval!.tool, message.approval!.arguments, "approve")}>Approve</button>
                  <button className="rounded-md border px-3 py-1.5 text-xs" onClick={() => onApprovalDecision(message.id, message.approval!.checkpointId, message.approval!.tool, message.approval!.arguments, "deny")}>Deny</button>
                </div>
              ) : (
                <p className="text-xs font-medium capitalize">{message.approval.status === "approving" ? "Working…" : message.approval.status}</p>
              )}
            </div>
          )}
        </div>
        )}
        <Timestamp at={message.timestamp} />
      </div>
    </div>
  )
}

function approvalLabel(tool: string, category?: string): string {
  const noun = category === "interactive_fiction" ? "passage" : "scene"
  if (tool === "rewrite_scene") return `Replace ${noun}`
  if (tool === "delete_scene") return `Delete ${noun}`
  if (tool === "append_to_scene") return `Add to ${noun}`
  if (tool === "rename_scene") return `Rename ${noun}`
  if (tool === "create_scene") return `Create ${noun}`
  if (tool === "add_beat") return "Add story beat"
  return "Apply change"
}

function approvalSummary(args: Record<string, unknown>): string {
  if (typeof args.content === "string") {
    const compact = args.content.replace(/\s+/g, " ").trim()
    return compact.length > 100 ? `${compact.slice(0, 100)}…` : compact
  }
  return "This action can remove existing writing."
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
