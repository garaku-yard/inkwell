import { Loader2 } from "lucide-react"

/** Centered spinner for an in-pane loading state — fills its container
 *  via h-full w-full, so use it inside a layout that already has a
 *  bounded size (an editor pane, a project route's content area). For
 *  whole-route / first-paint loading use FullPageSpinner instead. */
export function PaneSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
