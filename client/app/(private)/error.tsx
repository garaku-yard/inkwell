"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Route-level error boundary for the authenticated app. Without this, an
 * unexpected throw in any private page (e.g. a malformed analytics payload)
 * unmounts to React's default error screen instead of themed UI. `reset`
 * re-renders the segment so the user can retry without a full reload.
 */
export default function PrivateError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Route error:", error)
  }, [error])

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page hit an unexpected error. Your work is saved locally — try again, and if it keeps
          happening, reopen the project.
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  )
}
