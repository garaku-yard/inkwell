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

/** Header for the Writing Buddy panel — title, animated avatar, the
 *  provider picker (only rendered when at least one provider exists),
 *  and the close button. Pure presentational; lives next to the chat
 *  hooks so the panel can compose all three pieces in one import. */
export function AIChatHeader({ providers, selectedId, onSelect, onClose }: AIChatHeaderProps) {
  return (
    <div className="relative p-6 border-b border-border/40 flex-shrink-0 space-y-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="relative p-2.5 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 rounded-2xl ring-1 ring-primary/20 shadow-lg shadow-primary/10">
            <Bot className="h-5 w-5 text-primary" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full ring-2 ring-background animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-lg tracking-tight">Writing Buddy</h3>
            <p className="text-xs text-muted-foreground/80 font-medium">
              Crafting Ideas, One Word at a Time
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 hover:bg-muted/60 hover:rotate-90 transition-all duration-300 rounded-xl"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {providers.length > 0 && (
        <div className="relative">
          <Select value={selectedId ?? undefined} onValueChange={onSelect}>
            <SelectTrigger className="h-9 bg-background/70 text-sm">
              <SelectValue placeholder="Pick a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-medium">{p.label}</span>
                  {p.defaultModel && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.defaultModel}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
