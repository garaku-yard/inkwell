import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
} from "lucide-react"

import type { VaultNote } from "@/lib/storage"
import { cn } from "@/lib/utils"

interface VaultTreeFolderNode {
  type: "folder"
  name: string
  path: string
  children: VaultTreeNode[]
}

interface VaultTreeFileNode {
  type: "file"
  note: VaultNote
}

export type VaultTreeNode = VaultTreeFolderNode | VaultTreeFileNode

interface TreeNodeViewProps {
  node: VaultTreeNode
  depth: number
  selected: VaultNote | null
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (note: VaultNote) => void
  onNewNoteInFolder: (folderPath: string) => void
  onNewSubfolder: (parentPath: string) => void
}

/** Recursive tree row. Folders get a chevron + folder icon and toggle on
 *  click; hovering reveals inline actions for creating a note or
 *  subfolder inside. Files get a file icon + title. */
export function TreeNodeView({
  node,
  depth,
  selected,
  expanded,
  onToggle,
  onSelect,
  onNewNoteInFolder,
  onNewSubfolder,
}: TreeNodeViewProps) {
  if (node.type === "folder") {
    const open = expanded.has(node.path)
    return (
      <li>
        <div
          className="group flex items-center gap-1 rounded-md pr-1 hover:bg-accent/50"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm text-foreground/80"
            title={node.path}
          >
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {open ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          <button
            type="button"
            onClick={() => onNewSubfolder(node.path)}
            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex"
            title="New subfolder"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onNewNoteInFolder(node.path)}
            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex"
            title="New note in folder"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {open && node.children.length > 0 && (
          <ul className="space-y-0.5">
            {node.children.map((child, i) => (
              <TreeNodeView
                key={nodeKey(child, i)}
                node={child}
                depth={depth + 1}
                selected={selected}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onNewNoteInFolder={onNewNoteInFolder}
                onNewSubfolder={onNewSubfolder}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const active = selected?.filename === node.note.filename
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.note)}
        style={{ paddingLeft: `${depth * 12 + 22}px` }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition-colors",
          active ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-accent/50",
        )}
        title={node.note.filename}
      >
        <FileText
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            active ? "text-accent-foreground" : "text-muted-foreground",
          )}
        />
        <span className="truncate">{node.note.title}</span>
      </button>
    </li>
  )
}

export function nodeKey(node: VaultTreeNode, index: number): string {
  return node.type === "folder"
    ? `folder:${node.path}`
    : `file:${node.note.filename}#${index}`
}

/** Derives a collapsible tree from the flat VaultNote list by splitting
 *  `filename` on `/`. Sorted so folders surface first at each level,
 *  then files, each group alphabetical. */
export function buildVaultTree(notes: VaultNote[]): VaultTreeNode[] {
  const root: VaultTreeFolderNode = { type: "folder", name: "", path: "", children: [] }
  for (const note of notes) {
    const parts = note.filename.split("/")
    const fileName = parts.pop()!
    let cursor = root
    let curPath = ""
    for (const seg of parts) {
      curPath = curPath ? `${curPath}/${seg}` : seg
      let child = cursor.children.find(
        (c) => c.type === "folder" && c.name === seg,
      ) as VaultTreeFolderNode | undefined
      if (!child) {
        child = { type: "folder", name: seg, path: curPath, children: [] }
        cursor.children.push(child)
      }
      cursor = child
    }
    cursor.children.push({ type: "file", note })
    // Prevent the unused-var lint fire in branches that don't consume
    // `fileName` — it's the leaf we just attached.
    void fileName
  }
  sortTree(root)
  return root.children
}

function sortTree(folder: VaultTreeFolderNode): void {
  folder.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    const aName = a.type === "folder" ? a.name : a.note.title
    const bName = b.type === "folder" ? b.name : b.note.title
    return aName.localeCompare(bName)
  })
  for (const child of folder.children) {
    if (child.type === "folder") sortTree(child)
  }
}
