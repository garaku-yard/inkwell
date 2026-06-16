import { describe, expect, it } from "vitest"

import { cosineTopK, dot } from "@/lib/ai/cosine"

const v = (...xs: number[]) => Float32Array.from(xs)

describe("dot", () => {
  it("is 1 for identical unit vectors and 0 for orthogonal ones", () => {
    expect(dot(v(1, 0, 0), v(1, 0, 0))).toBeCloseTo(1)
    expect(dot(v(1, 0, 0), v(0, 1, 0))).toBeCloseTo(0)
  })

  it("truncates to the shorter length without reading past either buffer", () => {
    expect(dot(v(1, 2, 3), v(1, 2))).toBeCloseTo(5)
  })
})

describe("cosineTopK", () => {
  const rows = [
    { vector: v(1, 0, 0), payload: "x" },
    { vector: v(0, 1, 0), payload: "y" },
    { vector: v(0.9, 0.1, 0), payload: "near-x" },
  ]

  it("ranks by descending similarity to the query", () => {
    const top = cosineTopK(v(1, 0, 0), rows, 3)
    expect(top.map((t) => t.payload)).toEqual(["x", "near-x", "y"])
    expect(top[0].score).toBeGreaterThan(top[1].score)
  })

  it("respects k", () => {
    expect(cosineTopK(v(1, 0, 0), rows, 2)).toHaveLength(2)
    expect(cosineTopK(v(1, 0, 0), rows, 0)).toHaveLength(0)
  })
})
