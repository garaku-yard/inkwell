import { Loader2 } from "lucide-react"

/** Full-viewport spinner for whole-route loading states (analytics
 *  pages, anything mounted at the top of a route segment). Uses
 *  h-screen, so don't nest it inside another bounded container; for
 *  in-pane loading use PaneSpinner. */
export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
