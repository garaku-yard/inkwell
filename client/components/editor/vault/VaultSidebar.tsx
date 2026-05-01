import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Hash,
  Plus,
  Search,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { VaultNote, VaultTag } from "@/lib/storage"
import { cn } from "@/lib/utils"

import { TreeNodeView, nodeKey, type VaultTreeNode } from "./VaultTreeNode"

interface VaultSidebarProps {
  notes: VaultNote[]
  tree: VaultTreeNode[]
  search: string
  onSearch: (next: string) => void
  filteredCount: number
  selected: VaultNote | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectNote: (note: VaultNote) => void
  /** Click "+ New note" inside a folder row, or click the toolbar
   *  button (folderPath = null). */
  onCreateNoteIn: (folderPath: string | null) => void
  /** Click "+ Subfolder" inside a folder row, or the toolbar's New
   *  Folder button (parentPath = null). */
  onCreateSubfolder: (parentPath: string | null) => void
  tags: VaultTag[]
  tagFilter: string | null
  tagsExpanded: boolean
  setTagsExpanded: (next: boolean | ((v: boolean) => boolean)) => void
  setTagFilter: (next: string | null) => void
  onTagClick: (tag: string) => void
}

/** Left pane of the vault editor — search, folder tree, tags panel,
 *  and the footer counter. Pure render; the parent owns all the data
 *  + handlers and threads them in. */
export function VaultSidebar({
  notes,
  tree,
  search,
  onSearch,
  filteredCount,
  selected,
  expandedFolders,
  onToggleFolder,
  onSelectNote,
  onCreateNoteIn,
  onCreateSubfolder,
  tags,
  tagFilter,
  tagsExpanded,
  setTagsExpanded,
  setTagFilter,
  onTagClick,
}: VaultSidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="flex shrink-0 items-center gap-1 p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter notes"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onCreateSubfolder(null)}
          title="New folder"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onCreateNoteIn(null)}
          title="New note"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {tree.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {notes.length === 0 ? "No notes yet." : `No notes match "${search}".`}
          </div>
        ) : (
          <ul className="space-y-0.5 px-1.5">
            {tree.map((node, i) => (
              <TreeNodeView
                key={nodeKey(node, i)}
                node={node}
                depth={0}
                selected={selected}
                expanded={expandedFolders}
                onToggle={onToggleFolder}
                onSelect={onSelectNote}
                onNewNoteInFolder={onCreateNoteIn}
                onNewSubfolder={onCreateSubfolder}
              />
            ))}
          </ul>
        )}
      </div>

      {tags.length > 0 && (
        <div className="shrink-0 border-t">
          <button
            type="button"
            onClick={() => setTagsExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {tagsExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Tags
            <span className="ml-auto text-[10px] font-normal normal-case">{tags.length}</span>
          </button>
          {tagsExpanded && (
            <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto px-2 pb-2">
              {tags.map((t) => {
                const active = tagFilter?.toLowerCase() === t.tag.toLowerCase()
                return (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => onTagClick(t.tag)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    title={`${t.count} ${t.count === 1 ? "note" : "notes"}`}
                  >
                    <Hash className="h-3 w-3" />
                    <span>{t.tag}</span>
                    <span className="text-[10px] opacity-70">{t.count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          {filteredCount}
          {filteredCount !== notes.length && ` / ${notes.length}`}{" "}
          {notes.length === 1 ? "note" : "notes"}
        </span>
        {tagFilter && (
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/15"
            title="Clear tag filter"
          >
            <Hash className="h-3 w-3" />
            {tagFilter}
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </aside>
  )
}

