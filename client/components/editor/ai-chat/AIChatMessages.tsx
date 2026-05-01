import { forwardRef } from "react"
import Link from "next/link"
import { AlertCircle, Bot, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import type { ChatMessage } from "./useAIChatStream"

interface AIChatMessagesProps {
  messages: ChatMessage[]
  isTyping: boolean
  showEmptyState: boolean
}

/** The scrollable middle of the chat panel — empty-state card,
 *  user/AI/error bubbles, and the bouncing-dots typing indicator. The
 *  ref is the bottom anchor so the parent can scroll-into-view on new
 *  messages. */
export const AIChatMessages = forwardRef<HTMLDivElement, AIChatMessagesProps>(
  function AIChatMessages({ messages, isTyping, showEmptyState }, anchorRef) {
    return (
      <ScrollArea className="flex-1 p-5 min-h-0">
        <div className="space-y-7 p-1">
          {showEmptyState ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                No AI providers configured yet.
              </div>
              <Link
                href="/settings"
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                Set one up in Settings → AI Providers
              </Link>
            </div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          {isTyping && <TypingIndicator />}
          <div ref={anchorRef} />
        </div>
      </ScrollArea>
    )
  },
)

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div
      className={cn(
        "flex gap-3.5 items-start",
        message.type === "user" ? "justify-end" : "justify-start",
      )}
    >
      {message.type === "ai" && (
        <Avatar
          className={cn(
            "h-10 w-10 flex-shrink-0 ring-2 shadow-lg",
            message.error
              ? "ring-destructive/40 shadow-destructive/10"
              : "ring-primary/30 shadow-primary/10",
          )}
        >
          <AvatarFallback
            className={cn(
              "bg-gradient-to-br",
              message.error
                ? "from-destructive/20 via-destructive/15 to-destructive/10 text-destructive"
                : "from-primary/20 via-primary/15 to-primary/10 text-primary",
            )}
          >
            {message.error ? (
              <AlertCircle className="h-4.5 w-4.5" />
            ) : (
              <Bot className="h-4.5 w-4.5" />
            )}
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "flex flex-col gap-2",
          message.type === "user" ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "max-w-[340px] rounded-2xl px-5 py-3.5 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02]",
            message.type === "user"
              ? "bg-gradient-to-br from-primary via-primary/95 to-primary/90 text-primary-foreground rounded-tr-sm shadow-primary/20"
              : message.error
                ? "bg-destructive/10 border border-destructive/30 text-destructive rounded-tl-sm shadow-destructive/10"
                : "bg-gradient-to-br from-muted/95 via-muted/90 to-muted/85 border border-border/40 rounded-tl-sm",
          )}
        >
          <p className="text-sm leading-relaxed whitespace-pre-line font-medium">
            {message.content}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground/50 px-2.5 font-semibold tracking-wide">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {message.type === "user" && (
        <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-border/40 shadow-lg">
          <AvatarFallback className="bg-gradient-to-br from-muted via-muted/95 to-muted/90 text-foreground">
            <User className="h-4.5 w-4.5" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3.5 items-start justify-start">
      <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-primary/30 shadow-lg shadow-primary/10">
        <AvatarFallback className="bg-gradient-to-br from-primary/20 via-primary/15 to-primary/10 text-primary">
          <Bot className="h-4.5 w-4.5" />
        </AvatarFallback>
      </Avatar>
      <div className="bg-gradient-to-br from-muted/95 via-muted/90 to-muted/85 border border-border/40 rounded-2xl rounded-tl-sm px-6 py-4 shadow-lg">
        <div className="flex gap-2">
          <div
            className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce shadow-sm"
            style={{ animationDelay: "0ms", animationDuration: "1s" }}
          />
          <div
            className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce shadow-sm"
            style={{ animationDelay: "200ms", animationDuration: "1s" }}
          />
          <div
            className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce shadow-sm"
            style={{ animationDelay: "400ms", animationDuration: "1s" }}
          />
        </div>
      </div>
    </div>
  )
}
