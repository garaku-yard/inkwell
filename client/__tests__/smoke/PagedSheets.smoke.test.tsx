import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { PagedSheets, A4_METRICS, type SheetMetrics } from "@/components/editor/shared/PagedSheets"
import type { RailEntry } from "@/components/editor/shared/EditorToolRail"

/**
 * Pins the editor canvas visual contract (BRANDBOOK §8 "Editor canvas"): every
 * manuscript editor renders the SAME page surface — discrete A4 sheets stacked on
 * a desk, page numbers, and the tool rail out in the margin. Only the content
 * vocabulary differs. These assertions guard that one-product-feel from drift.
 */

type Block = { key: string; text: string }
const pages: Block[][] = [
  [{ key: "a", text: "Alpha" }],
  [{ key: "b", text: "Beta" }],
]
const renderBlock = (b: Block) => <p>{b.text}</p>

const US_LETTER: SheetMetrics = {
  width: "8.5in",
  minHeight: "11in",
  paddingClass: "px-16 py-20",
  contentClass: "text-base",
  pageNumber: { position: "top-right", render: (n) => n },
}

const Icon = () => null
const rail: RailEntry[] = [{ type: "heading", label: "Heading", icon: Icon }]

describe("PagedSheets (editor canvas contract)", () => {
  it("renders one discrete sheet per page at A4 geometry", () => {
    const { container } = render(
      <PagedSheets pages={pages} renderBlock={renderBlock} fontFamily="serif" isEmpty={false} emptyState={null} />,
    )
    const sheets = container.querySelectorAll('[id^="page-"]')
    expect(sheets).toHaveLength(2)
    // A4 is the default geometry — the brand's standard manuscript page.
    // (Assert the raw inline style: happy-dom's CSSOM drops mm units.)
    expect(A4_METRICS.minHeight).toBe("297mm")
    expect(sheets[0].getAttribute("style") ?? "").toContain("min-height: 297mm")
    // Content blocks render on the sheets.
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("Beta")).toBeInTheDocument()
  })

  it("honours a custom page size (screenplay rides the same surface as US Letter)", () => {
    const { container } = render(
      <PagedSheets
        pages={pages}
        renderBlock={renderBlock}
        fontFamily="monospace"
        isEmpty={false}
        emptyState={null}
        pageSize={US_LETTER}
      />,
    )
    expect(container.querySelector("#page-0")?.getAttribute("style") ?? "").toContain("min-height: 11in")
  })

  it("renders a single blank sheet for the empty state (no page sheets)", () => {
    const { container } = render(
      <PagedSheets
        pages={[]}
        renderBlock={renderBlock}
        fontFamily="serif"
        isEmpty
        emptyState={<div>No chapters yet</div>}
      />,
    )
    expect(screen.getByText("No chapters yet")).toBeInTheDocument()
    expect(container.querySelectorAll('[id^="page-"]')).toHaveLength(0)
  })

  it("mounts the tool rail in the margin when rail items are supplied", () => {
    const onRailSelect = vi.fn()
    render(
      <PagedSheets
        pages={pages}
        renderBlock={renderBlock}
        fontFamily="serif"
        isEmpty={false}
        emptyState={null}
        railItems={rail}
        onRailSelect={onRailSelect}
      />,
    )
    expect(screen.getByRole("button", { name: "Heading" })).toBeInTheDocument()
  })

  it("omits the rail when no rail items are supplied (e.g. screenplay supplies its own)", () => {
    render(
      <PagedSheets pages={pages} renderBlock={renderBlock} fontFamily="serif" isEmpty={false} emptyState={null} />,
    )
    expect(screen.queryByRole("button", { name: "Heading" })).not.toBeInTheDocument()
  })
})
