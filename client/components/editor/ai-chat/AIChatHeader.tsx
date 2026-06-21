import { Bot, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AIProviderSettings } from "@/lib/storage"

interface AIChatHeaderProps {
  providers: AIProviderSettings[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}

/** Header for the Writing Buddy panel — a quiet icon + label that mirrors the
 *  editor sidebar header, the provider picker (only when a provider exists),
 *  and a plain close button. Flat by design: no gradients, rings, or status
 *  glow, so it sits inside the same calm language as the rest of the editor. */
export function AIChatHeader({ providers, selectedId, onSelect, onClose }: AIChatHeaderProps) {
  return (
    <div className="flex-shrink-0 space-y-2 border-b p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Writing Buddy</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close Writing Buddy"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {providers.length > 0 && (
        <Select value={selectedId ?? undefined} onValueChange={onSelect}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Pick a provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-medium">{p.label}</span>
                {p.defaultModel && (
                  <span className="ml-2 text-xs text-muted-foreground">{p.defaultModel}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
