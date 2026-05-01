import { forwardRef, type KeyboardEvent } from "react"
import { Send, Sparkles, Square } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AIChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  /** Whether a chat reply is currently streaming. The composer swaps
   *  the send button for a stop button while this is true and disables
   *  the input. */
  isTyping: boolean
  /** Whether a provider is selected and a send is permitted. False
   *  when the user hasn't configured any usable providers yet. */
  canSend: boolean
  /** Switches the placeholder text and gives the user a nudge toward
   *  Settings → AI Providers when nothing is configured. */
  emptyState: boolean
}

/** Bottom of the chat panel: text input, send/stop button, AI Powered
 *  badge, and the Enter-to-send hint. */
export const AIChatComposer = forwardRef<HTMLInputElement, AIChatComposerProps>(
  function AIChatComposer({ value, onChange, onSend, onStop, isTyping, canSend, emptyState }, ref) {
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        onSend()
      }
    }
    return (
      <div className="p-5 border-t border-border/40 bg-gradient-to-t from-muted/20 via-muted/10 to-transparent flex-shrink-0">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Input
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                emptyState
                  ? "Add a provider to start chatting…"
                  : "Ask for writing suggestions..."
              }
              className="w-full text-sm bg-background/90 border-border/40 h-11 pl-4 pr-4 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 font-medium"
              disabled={isTyping || !canSend}
            />
          </div>
          {isTyping ? (
            <Button
              size="icon"
              onClick={onStop}
              className="h-11 w-11 flex-shrink-0 shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 rounded-xl bg-gradient-to-br from-destructive/90 to-destructive"
              aria-label="Stop response"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={onSend}
              disabled={!value.trim() || !canSend}
              className="h-11 w-11 flex-shrink-0 shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 rounded-xl bg-gradient-to-br from-primary to-primary/90"
            >
              <Send className="h-4.5 w-4.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <Badge
            variant="secondary"
            className="text-xs px-3 py-1.5 bg-gradient-to-r from-primary/15 to-primary/10 text-primary border-primary/30 shadow-sm font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
            AI Powered
          </Badge>
          <span className="text-xs text-muted-foreground/60 font-medium">Press Enter to send</span>
        </div>
      </div>
    )
  },
)
