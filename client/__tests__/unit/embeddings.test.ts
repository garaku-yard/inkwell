import { describe, expect, it } from "vitest"

import { deserializeVec, serializeVec } from "@/lib/ai/embeddings"

describe("vector (de)serialisation", () => {
  it("round-trips a Float32Array through base64 without loss", () => {
    const original = Float32Array.from([0, 1, -1, 0.5, -0.25, 3.14159])
    const restored = deserializeVec(serializeVec(original))
    expect(restored.length).toBe(original.length)
    original.forEach((value, i) => expect(restored[i]).toBeCloseTo(value, 6))
  })

  it("produces a compact base64 string (4 bytes per dim)", () => {
    const vec = new Float32Array(384)
    const encoded = serializeVec(vec)
    // 384 * 4 = 1536 bytes -> base64 length is ceil(1536/3)*4 = 2048.
    expect(encoded.length).toBe(2048)
  })
})
