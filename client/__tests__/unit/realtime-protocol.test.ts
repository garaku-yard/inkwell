import { describe, it, expect } from "vitest"

import { parseServerFrame } from "@/lib/realtime/protocol"

describe("parseServerFrame", () => {
  it("parses each known frame type", () => {
    expect(parseServerFrame('{"type":"roster","peers":[]}')?.type).toBe("roster")
    expect(parseServerFrame('{"type":"peer_join","peer":{"connId":"1","userId":"u","name":"A"}}')?.type).toBe(
      "peer_join",
    )
    expect(parseServerFrame('{"type":"peer_leave","connId":"1"}')?.type).toBe("peer_leave")
    expect(parseServerFrame('{"type":"focus","peer":{"connId":"1","userId":"u","name":"A"}}')?.type).toBe(
      "focus",
    )
  })

  it("parses an edit frame with its content payload", () => {
    const frame = parseServerFrame('{"type":"edit","elementId":"el-1","content":"hi","isScene":false}')
    expect(frame).toEqual({ type: "edit", elementId: "el-1", content: "hi", isScene: false })
  })

  it("parses a caret frame with identity + offset", () => {
    const frame = parseServerFrame(
      '{"type":"caret","connId":"c1","userId":"u","name":"Ada","elementId":"el-1","offset":7}',
    )
    expect(frame).toEqual({
      type: "caret",
      connId: "c1",
      userId: "u",
      name: "Ada",
      elementId: "el-1",
      offset: 7,
    })
  })

  it("rejects garbage, unknown types, and typeless frames", () => {
    expect(parseServerFrame("not json")).toBeNull()
    expect(parseServerFrame('{"type":"bogus"}')).toBeNull()
    expect(parseServerFrame('{"elementId":"x"}')).toBeNull()
    expect(parseServerFrame("null")).toBeNull()
  })
})
