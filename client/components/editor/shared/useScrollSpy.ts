"use client"

/**
 * Scrollspy: tracks which item in a list of refs is currently in
 * focus near the top of the scroll container, returning its id so
 * a sidebar can highlight the active chapter / poem / passage.
 *
 * Implementation uses IntersectionObserver with a rootMargin that
 * fires only for elements whose top edge is in the upper 15% of the
 * viewport — biased toward "what the writer is reading right now"
 * rather than "what's centered." Falls back to the first id if no
 * element has crossed the trigger band yet (e.g. before any scroll).
 */

import { useEffect, useState, type RefObject } from "react"

interface UseScrollSpyOptions {
  /** The Map of element ids → DOM refs to observe. Pass the same
   *  ref Map you populate during render via `ref={el => map.set(id, el)}`. */
  refs: RefObject<Map<string, HTMLElement | null>>
  /** Ordered list of ids in render order. Used to pick a fallback
   *  active id (the first one) and to disambiguate when several
   *  elements are intersecting at once. */
  orderedIds: string[]
}

export function useScrollSpy({ refs, orderedIds }: UseScrollSpyOptions): string | null {
  const [activeId, setActiveId] = useState<string | null>(orderedIds[0] ?? null)

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    if (orderedIds.length === 0) return

    // Track the most recent intersection ratio per id. We read the
    // map after each callback to pick the topmost currently-visible
    // element, which is more stable than reacting only to entries
    // delivered in the current callback batch.
    const visibleIds = new Set<string>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.scrollspyId
          if (!id) continue
          if (entry.isIntersecting) visibleIds.add(id)
          else visibleIds.delete(id)
        }
        // Pick the first id in document order that's currently visible.
        // Stable when the user scrolls past several at once.
        for (const id of orderedIds) {
          if (visibleIds.has(id)) {
            setActiveId(id)
            return
          }
        }
      },
      {
        // The trigger band: top 0% to 85% of the viewport. An element
        // counts as active once its top edge enters the band, and
        // stops counting when its bottom edge leaves the top 15%.
        rootMargin: "0% 0% -85% 0%",
        threshold: 0,
      },
    )

    const elements: HTMLElement[] = []
    for (const id of orderedIds) {
      const el = refs.current?.get(id)
      if (!el) continue
      el.dataset.scrollspyId = id
      observer.observe(el)
      elements.push(el)
    }

    return () => {
      for (const el of elements) observer.unobserve(el)
      observer.disconnect()
    }
  }, [refs, orderedIds])

  return activeId
}
