import { Paperclip, PanelRight, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface VaultNoteToolbarProps {
  /** Title of the currently-open note. Shown as a button users can
   *  click to start renaming. */
  title: string
  /** Non-null while the user is editing the title; null means
   *  "showing the static title button." */
  renameDraft: string | null
  setRenameDraft: (draft: string | null) => void
  onCommitRename: () => Promise<void> | void
  showBacklinks: boolean
  onToggleBacklinks: () => void
  onDelete: () => void
  /** Open a file picker, copy the chosen file into the vault's
   *  `attachments/` folder, and append a markdown link/image to the
   *  current note. Disabled on the web build. */
  onAttach?: () => void
}

/** Toolbar above the markdown editor — clickable / inline-editable
 *  title plus the backlinks-panel and delete-note buttons. */
export function VaultNoteToolbar({
  title,
  renameDraft,
  setRenameDraft,
  onCommitRename,
  showBacklinks,
  onToggleBacklinks,
  onDelete,
  onAttach,
}: VaultNoteToolbarProps) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {renameDraft === null ? (
        <button
          type="button"
          onClick={() => setRenameDraft(title)}
          className="flex-1 truncate rounded px-1.5 py-1 text-left text-sm font-semibold hover:bg-accent/50"
          title="Click to rename"
        >
          {title}
        </button>
      ) : (
        <Input
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => void onCommitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void onCommitRename()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setRenameDraft(null)
            }
          }}
          className="h-8 flex-1 text-sm font-semibold"
        />
      )}

      {onAttach && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onAttach}
          title="Attach a file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
      )}

      <Button
        size="icon"
        variant="ghost"
        className={cn("h-8 w-8", showBacklinks && "bg-muted text-foreground")}
        onClick={onToggleBacklinks}
        title="Toggle backlinks panel"
      >
        <PanelRight className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
        title="Delete note"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
