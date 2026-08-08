"use client"

/**
 * EditorSidebar — the shared left rail for the format editors (Prose, Poetry,
 * Comic, TabletopRPG, Interactive Fiction). Brings them up to the screenplay's
 * sidebar class: a labelled header, stat badges, and tabbed [List | Comments].
 *
 * It's the engine; each editor supplies its own vocabulary — the noun in the
 * header ("Chapters" / "Poems" / "Pages" / "Sections" / "Passages"), the item
 * list, the stats, and the add action. Comments are wired through the generic
 * {@link useEditorComments} hook and rendered by the existing CommentPanel, so
 * the experience matches the screenplay reference. The screenplay keeps its own
 * scene/element-aware SidePanel; this is for the flatter formats.
 */

import React, { useMemo, useState } from "react"
import { MessageCircle, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Comment, ProjectElement, Scene } from "@/services/project"
import { CommentPanel } from "../CommentPanel"

/** A nested nav entry shown indented under an item (e.g. TTRPG subheadings). */
export interface EditorSidebarSubItem {
  id: string
  title: string
  /** Run when the sub-entry is clicked (typically scroll-to-element). */
  onSelect: () => void
}

/** One row in the list tab — a chapter, poem, page, section, or passage. */
export interface EditorSidebarItem {
  id: string
  /** Display title; pass a sensible fallback (e.g. "Untitled") for blanks. */
  title: string
  /** 1-based position shown as a leading index. */
  index: number
  /** Optional secondary line (e.g. "1,200w"). */
  meta?: string
  /** Element / scene ids owned by this item, used to count its comments. */
  commentTargetIds?: string[]
  /** Optional nested entries shown indented beneath the item. */
  subItems?: EditorSidebarSubItem[]
  /** Extra text the search box matches against (e.g. body content), so a
   *  consumer can search more than the title. Falls back to the title. */
  searchText?: string
  /** Optional trailing node on the title row (e.g. live-presence pips marking
   *  who is editing this item). Purely decorative; ignored for search. */
  adornment?: React.ReactNode
}

/** A small stat badge shown under the header (e.g. count, word total). */
export interface EditorSidebarStat {
  icon: React.ComponentType<{ className?: string }>
  label: string
}

/** The thing a new comment attaches to — the focused element, or a scene. */
export interface EditorSidebarCommentTarget {
  item: Scene | ProjectElement
  isScene: boolean
}

interface EditorSidebarProps {
  headerIcon: React.ComponentType<{ className?: string }>
  /** Header label; doubles as the list tab's label (e.g. "Chapters"). */
  headerLabel: string
  stats?: EditorSidebarStat[]
  items: EditorSidebarItem[]
  activeItemId: string | null
  onItemClick: (id: string) => void
  addLabel: string
  onAdd: () => void
  /** Shown in the list tab when there are no items. */
  emptyLabel?: string
  /** Width utility for the aside; defaults to w-72. */
  widthClassName?: string
  /** Show a search box above the list that filters items by title (or their
   *  `searchText` when provided). */
  searchable?: boolean
  searchPlaceholder?: string

  comments: Comment[]
  /** What a new comment attaches to right now; null disables posting. */
  activeCommentTarget: EditorSidebarCommentTarget | null
  onAddComment: (elementId: string, isScene: boolean, content: string) => void
  onUpdateComment: (commentId: string, content: string) => void
  onDeleteComment: (commentId: string) => void
  onToggleCommentResolved: (elementId: string, commentId: string, isScene: boolean, newResolvedState: boolean) => void
}

export function EditorSidebar({
  headerIcon: HeaderIcon,
  headerLabel,
  stats,
  items,
  activeItemId,
  onItemClick,
  addLabel,
  onAdd,
  emptyLabel = "Nothing here yet.",
  widthClassName = "w-72",
  searchable = false,
  searchPlaceholder = "Search…",
  comments,
  activeCommentTarget,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onToggleCommentResolved,
}: EditorSidebarProps) {
  const [tab, setTab] = useState("items")
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const shownItems = q
    ? items.filter((it) => (it.searchText ?? it.title).toLowerCase().includes(q))
    : items

  const unresolvedTotal = useMemo(
    () => comments.filter((c) => !c.isResolved).length,
    [comments],
  )

  const commentCountFor = (item: EditorSidebarItem) => {
    if (!item.commentTargetIds?.length) return 0
    return comments.filter((c) => c.elementId && item.commentTargetIds!.includes(c.elementId)).length
  }

  // Build the CommentPanel's activeElement: the focused element/scene with its
  // comments attached, matching the discriminated-union shape it expects.
  const activeElementForPanel = useMemo(() => {
    if (!activeCommentTarget) return null
    const targetComments = comments.filter((c) => c.elementId === activeCommentTarget.item.id)
    return activeCommentTarget.isScene
      ? { ...(activeCommentTarget.item as Scene), isScene: true as const, comments: targetComments }
      : { ...(activeCommentTarget.item as ProjectElement), isScene: false as const, comments: targetComments }
  }, [activeCommentTarget, comments])

  return (
    <aside className={cn("flex flex-col min-h-0 border-r bg-sidebar", widthClassName)}>
      {/* Header + stats */}
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <HeaderIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{headerLabel}</span>
        </div>
        {stats && stats.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {stats.map((s, i) => {
              const Icon = s.icon
              return (
                <Badge key={i} variant="secondary" className="gap-1 font-normal">
                  <Icon className="h-3 w-3" />
                  {s.label}
                </Badge>
              )
            })}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-3 pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="items">{headerLabel}</TabsTrigger>
            <TabsTrigger value="comments" className="gap-1.5">
              Comments
              {unresolvedTotal > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">
                  {unresolvedTotal}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* List */}
        <TabsContent value="items" className="flex min-h-0 flex-1 flex-col">
          {searchable && (
            <div className="shrink-0 px-2 pt-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40"
              />
            </div>
          )}
          {/* bg-sidebar here, not just on <aside>: overflow-y-auto promotes this
              to its own compositing layer, and WebKit only uses subpixel
              antialiasing for text it can prove sits on an opaque backdrop
              *within the same layer*. The window is deliberately transparent for
              the rounded corners (see html/body at the top of globals.css), so a
              layer that paints no background of its own degrades the text.

              This alone is not enough: it only holds while the list fits. Once
              the content overflows, WebKit splits the scroller into a container
              (which is what this background paints) and a separate scrolling-
              contents layer that actually carries the rows — so the rows are
              back on an unpainted layer. Measured across two projects in one
              build: the 8-item list that fits renders its glyph cores at exactly
              rgb(105,98,92), the CSS --muted-foreground, on 1.5px stems; the
              10-item list that scrolls spreads the same text over 2.7px stems
              with 60% more ink and no fully-covered pixel at all. The rows carry
              their own background below for that reason — a row that paints its
              own opaque backdrop measured identical (1.7px vs 1.8px) in both. */}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-sidebar px-2 py-2">
          {shownItems.length === 0 ? (
            <p className="bg-sidebar px-3 py-8 text-center text-xs text-muted-foreground">
              {q ? "No matches." : emptyLabel}
            </p>
          ) : (
            shownItems.map((item) => {
              const active = item.id === activeItemId
              const cc = commentCountFor(item)
              return (
                <div key={item.id}>
                  <button
                    onClick={() => onItemClick(item.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "group w-full rounded-md px-3 py-2 text-left transition-colors",
                      // bg-sidebar (same colour as the scroller, so no visual
                      // change) gives every row the opaque backdrop the
                      // scrolling-contents layer does not inherit — see above.
                      active ? "bg-muted" : "bg-sidebar hover:bg-accent",
                    )}
                  >
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className={cn("shrink-0 text-xs", active ? "text-muted-foreground" : "text-muted-foreground/50")}>
                        {item.index}
                      </span>
                      <span
                        className={cn(
                          "truncate text-sm transition-colors",
                          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        {item.title}
                      </span>
                      {item.adornment && (
                        <span className="ml-auto shrink-0 self-center">{item.adornment}</span>
                      )}
                    </div>
                    {(item.meta || cc > 0) && (
                      <div className="mt-0.5 flex items-center gap-2 pl-4">
                        {item.meta && <span className="text-xs text-muted-foreground">{item.meta}</span>}
                        {cc > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                            <MessageCircle className="h-3 w-3" />
                            {cc}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  {item.subItems?.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={sub.onSelect}
                      className="w-full truncate rounded-md bg-sidebar py-1 pl-7 pr-3 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {sub.title}
                    </button>
                  ))}
                </div>
              )
            })
          )}
          </div>
        </TabsContent>

        {/* Comments */}
        <TabsContent value="comments" className="min-h-0 flex-1">
          <CommentPanel
            activeElement={activeElementForPanel}
            onAddComment={onAddComment}
            onUpdateComment={onUpdateComment}
            onDeleteComment={onDeleteComment}
            onToggleCommentResolved={onToggleCommentResolved}
          />
        </TabsContent>
      </Tabs>

      {/* Footer add — only on the list tab; it's out of context under Comments
          (and would otherwise stack right under the comment composer). */}
      {tab === "items" && (
        <div className="shrink-0 border-t p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </Button>
        </div>
      )}
    </aside>
  )
}
