import { Loader2 } from "lucide-react"

/** Full-route spinner for whole-route loading states (analytics pages,
 *  anything mounted at the top of a route segment). Fills its container
 *  (`h-full`) rather than the viewport: every route renders inside the
 *  layout's #main, which is the viewport minus the window titlebar, so
 *  h-screen would overshoot by the height of that bar. For in-pane
 *  loading use PaneSpinner. */
export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
