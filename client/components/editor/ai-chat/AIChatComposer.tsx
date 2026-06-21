import { forwardRef, type KeyboardEvent } from "react"
import { Send, Square } from "lucide-react"

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
  /** Friendly label for the active provider — surfaced beside the
   *  Enter-to-send hint so writers know which key is being billed
   *  before they press Enter. Replaces the marketing-flavoured
   *  "AI Powered" badge that lived here previously. */
  providerLabel?: string
}

/** Bottom of the chat panel: text input, send/stop button, the
 *  Enter-to-send hint, and (when a provider is configured) a quiet
 *  provider-name pill so the user knows which key is being billed. */
export const AIChatComposer = forwardRef<HTMLInputElement, AIChatComposerProps>(
  function AIChatComposer({ value, onChange, onSend, onStop, isTyping, canSend, emptyState, providerLabel }, ref) {
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        onSend()
      }
    }
    return (
      <div className="p-4 border-t flex-shrink-0">
        <div className="flex gap-2 mb-2">
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
            className="flex-1 text-sm h-10 rounded-md"
            disabled={isTyping || !canSend}
          />
          {isTyping ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={onStop}
              className="h-10 w-10 flex-shrink-0"
              aria-label="Stop response"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={onSend}
              disabled={!value.trim() || !canSend}
              className="h-10 w-10 flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate" title={providerLabel ?? ""}>
            {providerLabel ?? ""}
          </span>
          <span className="shrink-0">Press Enter to send</span>
        </div>
      </div>
    )
  },
)
