/** The drawing layer's job is geometry: turn a point list plus a kind into SVG.
 *  That's silent when it's wrong — a mis-normalised rect just looks like a
 *  drawing someone made badly — so it's worth pinning. */
import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

import { DrawingLayer } from "@/components/beat-board/DrawingLayer"
import type { Drawing } from "@/services/beat-board"

const shape = (over: Partial<Drawing> & { kind: Drawing["kind"] }): Drawing => ({
  id: over.id ?? "d1",
  kind: over.kind,
  order: over.order ?? 0,
  data: over.data ?? { points: [], color: "#1f2420", width: 3 },
})

const noop = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  eraseShape: vi.fn(),
}

describe("DrawingLayer", () => {
  it("is inert with the select tool, so cards keep working", () => {
    const { getByTestId } = render(
      <DrawingLayer drawings={[]} draft={null} tool="select" {...noop} />,
    )
    expect(getByTestId("drawing-layer").style.pointerEvents).toBe("none")
  })

  it("takes the pointer once a tool is chosen", () => {
    const { getByTestId } = render(
      <DrawingLayer drawings={[]} draft={null} tool="pen" {...noop} />,
    )
    expect(getByTestId("drawing-layer").style.pointerEvents).toBe("auto")
  })

  it("renders a pen stroke as a path through every point", () => {
    const pen = shape({
      kind: "pen",
      data: { points: [{ x: 0, y: 0 }, { x: 5, y: 10 }], color: "#ff0000", width: 4 },
    })
    const { container } = render(<DrawingLayer drawings={[pen]} draft={null} tool="select" {...noop} />)
    const path = container.querySelector("path")
    expect(path?.getAttribute("d")).toBe("M 0 0 L 5 10")
    expect(path?.getAttribute("stroke")).toBe("#ff0000")
  })

  it("normalises a rect dragged up-and-left into positive width/height", () => {
    // Dragging bottom-right → top-left is the case that produces negative
    // width/height and silently renders nothing.
    const rect = shape({
      kind: "rect",
      data: { points: [{ x: 40, y: 30 }, { x: 10, y: 10 }], color: "#000", width: 2 },
    })
    const { container } = render(<DrawingLayer drawings={[rect]} draft={null} tool="select" {...noop} />)
    const el = container.querySelector("rect")
    expect(el?.getAttribute("x")).toBe("10")
    expect(el?.getAttribute("y")).toBe("10")
    expect(el?.getAttribute("width")).toBe("30")
    expect(el?.getAttribute("height")).toBe("20")
  })

  it("centres an ellipse on its bounding box", () => {
    const el = shape({
      kind: "ellipse",
      data: { points: [{ x: 0, y: 0 }, { x: 10, y: 20 }], color: "#000", width: 2 },
    })
    const { container } = render(<DrawingLayer drawings={[el]} draft={null} tool="select" {...noop} />)
    const e = container.querySelector("ellipse")
    expect(e?.getAttribute("cx")).toBe("5")
    expect(e?.getAttribute("cy")).toBe("10")
    expect(e?.getAttribute("rx")).toBe("5")
    expect(e?.getAttribute("ry")).toBe("10")
  })

  it("gives an arrow a head and a plain line none", () => {
    const pts = { points: [{ x: 0, y: 0 }, { x: 9, y: 9 }], color: "#000", width: 2 }
    const { container: withArrow } = render(
      <DrawingLayer drawings={[shape({ kind: "arrow", data: pts })]} draft={null} tool="select" {...noop} />,
    )
    const { container: plain } = render(
      <DrawingLayer drawings={[shape({ kind: "line", data: pts })]} draft={null} tool="select" {...noop} />,
    )
    expect(withArrow.querySelector("line")?.getAttribute("marker-end")).toContain("draw-arrowhead")
    expect(plain.querySelector("line")?.getAttribute("marker-end")).toBeNull()
  })

  it("skips a shape with too few points instead of throwing", () => {
    // The first frame of a stroke has one point; a half-drawn rect has one
    // corner. Neither should take the board down.
    const oneDot = shape({ kind: "pen", data: { points: [{ x: 1, y: 1 }], color: "#000", width: 2 } })
    const oneCorner = shape({ id: "d2", kind: "rect", data: { points: [{ x: 1, y: 1 }], color: "#000", width: 2 } })
    const { container } = render(
      <DrawingLayer drawings={[oneDot, oneCorner]} draft={null} tool="select" {...noop} />,
    )
    expect(container.querySelector("path")).toBeNull()
    expect(container.querySelector("rect")).toBeNull()
  })

  it("renders an unknown kind as nothing rather than crashing", () => {
    // A shape written by a newer build must not break the whole board.
    const alien = { ...shape({ kind: "pen" }), kind: "hexagon" } as unknown as Drawing
    expect(() =>
      render(<DrawingLayer drawings={[alien]} draft={null} tool="select" {...noop} />),
    ).not.toThrow()
  })

  it("erases the shape that was clicked", () => {
    const eraseShape = vi.fn()
    const pen = shape({
      kind: "pen",
      data: { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], color: "#000", width: 2 },
    })
    const { container } = render(
      <DrawingLayer drawings={[pen]} draft={null} tool="eraser" {...noop} eraseShape={eraseShape} />,
    )
    const g = container.querySelector("[data-drawing-id='d1']") as SVGGElement
    g.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    expect(eraseShape).toHaveBeenCalledWith("d1")
  })
})
