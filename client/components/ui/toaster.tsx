"use client"

/**
 * Toaster — renders the app's toast state (from `useToast`) as a bottom-right
 * stack. The project had the `use-toast` reducer but no toast UI, so every
 * `toast()` was silently invisible; this is the missing renderer. Deliberately
 * self-contained (no toast primitive dependency). Auto-dismiss is scheduled in
 * `toast()` itself, so this component is a pure render plus a close button.
 * Mounted once in the root layout.
 */

import { useRef, type ReactNode } from "react"
import { X } from "lucide-react"

import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export function Toaster() {
  const { toasts, dismiss } = useToast()
  // `dismiss` is a fresh closure each render; a ref keeps the click handler
  // stable without threading it through.
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  const visible = toasts.filter((t) => t.open !== false)

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 empty:hidden"
      role="region"
      aria-label="Notifications"
    >
      {visible.map((t) => {
        const destructive = t.variant === "destructive"
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg",
              destructive
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            <div className="grid flex-1 gap-1">
              {t.title && <p className="text-sm font-semibold leading-tight">{t.title as ReactNode}</p>}
              {t.description && (
                <p className={cn("text-sm", destructive ? "text-destructive-foreground/90" : "text-muted-foreground")}>
                  {t.description as ReactNode}
                </p>
              )}
              {t.action}
            </div>
            <button
              type="button"
              onClick={() => dismissRef.current(t.id)}
              aria-label="Dismiss notification"
              className={cn(
                "shrink-0 rounded-md p-1 transition-colors",
                destructive
                  ? "text-destructive-foreground/70 hover:text-destructive-foreground"
                  : "text-muted-foreground/70 hover:text-foreground",
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
