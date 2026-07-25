/** The canvas surface's size and the screen→canvas conversion. Both fail
 *  quietly: a surface that's too small clips shapes past the first screen
 *  (which is exactly how the drawing layer shipped), and a conversion that
 *  double-counts the scroll offset just puts things somewhere slightly wrong. */
import { describe, expect, it } from "vitest"

import { CANVAS_HEADROOM, canvasExtent, toCanvasPoint } from "@/components/beat-board/canvasGeometry"
import type { Beat } from "@/services/beat"
import type { Drawing } from "@/services/beat-board"

const beat = (x: number, y: number, width = 250, height = 150): Beat =>
  ({ id: `b${x}-${y}`, position: { x, y }, width, height }) as Beat

const stroke = (points: Array<{ x: number; y: number }>, width = 3): Drawing => ({
  id: "d1",
  kind: "pen",
  order: 0,
  data: { points, color: "#1f2420", width },
})

/** jsdom gives every element a zero rect, so the surface has to be faked. */
const surfaceAt = (left: number, top: number): HTMLElement => {
  const el = document.createElement("div")
  el.getBoundingClientRect = () => ({ left, top, right: 0, bottom: 0, width: 0, height: 0, x: left, y: top, toJSON: () => ({}) })
  return el
}

describe("canvasExtent", () => {
  it("is headroom-sized when the board is empty", () => {
    expect(canvasExtent([], [])).toEqual({ width: CANVAS_HEADROOM, height: CANVAS_HEADROOM })
  })

  it("reaches past the furthest beat's far corner, not its origin", () => {
    // A card placed at 2000 occupies up to 2250; sizing to the origin would clip
    // the card's own right edge.
    const extent = canvasExtent([beat(100, 100), beat(2000, 1400)], [])
    expect(extent.width).toBe(2000 + 250 + CANVAS_HEADROOM)
    expect(extent.height).toBe(1400 + 150 + CANVAS_HEADROOM)
  })

  it("reaches past the furthest shape, including half its stroke width", () => {
    // The stroke straddles the path, so a fat line hangs past its own points.
    const extent = canvasExtent([], [stroke([{ x: 0, y: 0 }, { x: 3000, y: 60 }], 20)])
    expect(extent.width).toBe(3000 + 10 + CANVAS_HEADROOM)
    expect(extent.height).toBe(60 + 10 + CANVAS_HEADROOM)
  })

  it("covers whichever of beats or shapes reaches furthest", () => {
    // A shape drawn out past every card is the case that regressed: sizing from
    // the cards alone leaves the drawing off the canvas.
    const extent = canvasExtent([beat(0, 0)], [stroke([{ x: 4000, y: 20 }, { x: 4100, y: 30 }], 2)])
    expect(extent.width).toBe(4100 + 1 + CANVAS_HEADROOM)
  })

  it("never goes negative-of-origin — the top-left of the canvas is (0,0)", () => {
    expect(canvasExtent([beat(0, 0, 0, 0)], []).width).toBe(CANVAS_HEADROOM)
  })
})

describe("toCanvasPoint", () => {
  it("subtracts the surface's rect and nothing else", () => {
    // The surface is at the window origin: an unscrolled board, so screen and
    // canvas coordinates agree.
    expect(toCanvasPoint(surfaceAt(0, 0), 120, 80)).toEqual({ x: 120, y: 80 })
  })

  it("reads the scroll offset out of the surface's own position", () => {
    // Scrolled 500 right / 300 down, the surface's left/top go negative by that
    // much. A click at screen (120, 80) is canvas (620, 380). Adding scrollLeft
    // on top of this — as the old create/drop path did against the scroll
    // container — would double it.
    expect(toCanvasPoint(surfaceAt(-500, -300), 120, 80)).toEqual({ x: 620, y: 380 })
  })

  it("returns the origin rather than throwing before the surface mounts", () => {
    expect(toCanvasPoint(null, 120, 80)).toEqual({ x: 0, y: 0 })
  })
})
