import { FileText, Link2 } from "lucide-react"

import type { VaultBacklink } from "@/lib/storage"

interface VaultBacklinksPaneProps {
  backlinks: VaultBacklink[]
  /** Title of the currently-open note. Used inside the empty-state
   *  copy ("Write [[NoteTitle]] elsewhere..."). */
  currentTitle: string
  /** Click on a backlink row — the parent resolves the filename to a
   *  note and navigates. */
  onSelectBacklink: (filename: string) => void
}

/** Right-side panel showing notes that link to the currently-open
 *  one. Renders an empty-state hint when there are no incoming links
 *  yet, otherwise a list of clickable cards with title + snippet. */
export function VaultBacklinksPane({
  backlinks,
  currentTitle,
  onSelectBacklink,
}: VaultBacklinksPaneProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-l bg-muted/20">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Backlinks
        <span className="ml-auto text-[10px] font-normal normal-case">
          {backlinks.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="min-h-full bg-sidebar">
          {backlinks.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No other notes link to this one yet. Write{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                [[{currentTitle}]]
              </code>{" "}
              elsewhere to create one.
            </div>
          ) : (
            <ul className="space-y-1">
              {backlinks.map((bl) => (
                <li key={bl.filename}>
                  <button
                    type="button"
                    onClick={() => onSelectBacklink(bl.filename)}
                    className="w-full rounded-md bg-sidebar p-2 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      {bl.title}
                    </div>
                    <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {bl.snippet}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  )
}
