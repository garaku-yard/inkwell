/**
 * paginate — pack a flat list of blocks onto fixed-height "sheets" using an
 * estimated per-block height. This is the coarse heuristic the manuscript
 * editors share to lay content on A4 pages: it never measures the DOM, so it's
 * cheap and deterministic, and downstream sheets use a CSS min-height so an
 * off-by-a-line estimate leaves trailing whitespace rather than clipping text.
 *
 * @typeParam T - the block type (each editor defines its own union)
 * @param items - blocks in render order
 * @param estimateHeight - approximate rendered height in px for a block
 * @param opts.maxHeight - target content height of one sheet in px
 * @param opts.startsNewSheetBefore - when it returns true for a block, that
 *   block opens a fresh sheet even if the current one still has room (e.g. each
 *   chapter / poem / page begins on its own sheet). Never breaks before the
 *   very first block.
 * @returns blocks grouped into sheets, in order
 */
export function paginate<T>(
  items: T[],
  estimateHeight: (item: T) => number,
  opts: { maxHeight: number; startsNewSheetBefore?: (item: T, index: number) => boolean },
): T[][] {
  const pages: T[][] = []
  let current: T[] = []
  let height = 0

  items.forEach((item, index) => {
    const h = estimateHeight(item)
    const forceBreak = current.length > 0 && (opts.startsNewSheetBefore?.(item, index) ?? false)
    const overflow = current.length > 0 && height + h > opts.maxHeight
    if (forceBreak || overflow) {
      pages.push(current)
      current = []
      height = 0
    }
    current.push(item)
    height += h
  })

  if (current.length > 0) pages.push(current)
  return pages
}
