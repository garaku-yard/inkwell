import { Button } from "@/components/ui/button"

interface EmptyEditorStateProps {
  message: string
  actionLabel: string
  onAction: () => void
}

/** Centered "no items yet — create the first one" card used inside the
 *  document area of the simpler format editors (Prose/Poetry/Comic/
 *  TabletopRPG) before any chapter/poem/page/section exists. Sits inside
 *  the editor's normal scroll container; doesn't claim full height. */
export function EmptyEditorState({ message, actionLabel, onAction }: EmptyEditorStateProps) {
  return (
    <div className="text-center text-muted-foreground text-sm py-24 space-y-4 font-sans">
      <p>{message}</p>
      <Button variant="outline" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  )
}
