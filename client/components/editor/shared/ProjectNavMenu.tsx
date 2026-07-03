"use client"

/**
 * Cross-feature navigation for a single project. Lets writers jump
 * between Editor / Beat Board / Outline / Analytics without bouncing
 * back to the dashboard. Mounts inside editor toolbars next to the
 * title.
 *
 * Rendered as a row of pills (not a dropdown) so every destination is
 * visible at a glance and the current view is highlighted in place —
 * no menu to open.
 *
 * Per CLAUDE.md, vault projects don't carry beats / outline / analytics
 * the same way story-shaped projects do. A vault project has only the
 * Editor destination, so the nav hides entirely there (a lone, always-
 * active pill would be pointless). A board project is the mirror image —
 * it IS the beat board and has no format editor / outline / analytics — so
 * it hides the nav too.
 */

import Link from "next/link"

import { cn } from "@/lib/utils"

type NavKey = "editor" | "beat-board" | "outline-editor" | "analytics"

interface ProjectNavMenuProps {
  projectId: string
  /** Project category — drives which destinations show up. Vault
   *  projects only see Editor, so the nav is hidden for them. */
  category?: string
  /** Which destination is currently active, so we can highlight its
   *  pill. Use the route's path segment ("editor" | "beat-board" |
   *  "outline-editor" | "analytics"). */
  current?: NavKey
}

export function ProjectNavMenu({ projectId, category, current = "editor" }: ProjectNavMenuProps) {
  // A vault or board project is single-surface — nowhere else to go — so skip
  // the nav rather than render a single inert pill.
  if (category === "vault" || category === "board") return null

  const items: { key: NavKey; label: string; href: string }[] = [
    { key: "editor", label: "Editor", href: `/projects/editor?id=${projectId}` },
    { key: "beat-board", label: "Beat Board", href: `/projects/beat-board?id=${projectId}` },
    { key: "outline-editor", label: "Outline", href: `/projects/outline-editor?id=${projectId}` },
    { key: "analytics", label: "Analytics", href: `/analytics?project=${projectId}` },
  ]

  return (
    <nav aria-label="Switch project view" className="flex items-center gap-0.5">
      {items.map((item) => {
        const active = item.key === current
        if (active) {
          return (
            <span
              key={item.key}
              aria-current="page"
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {item.label}
            </span>
          )
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors",
              "hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
