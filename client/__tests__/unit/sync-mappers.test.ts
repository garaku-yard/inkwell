import { describe, expect, it } from "vitest"

import {
  fromTs,
  pushBeat,
  pushConnection,
  pushElement,
  pushProject,
  toTs,
} from "@/lib/storage/local/sync-mappers"

describe("sync timestamp mapping", () => {
  it("round-trips ISO ↔ {seconds,nanos} at millisecond precision", () => {
    const iso = "2026-06-20T20:18:30.527Z"
    const ts = toTs(iso)!
    expect(ts.seconds).toBe(1781986710)
    expect(ts.nanos).toBe(527_000_000)
    expect(fromTs(ts)).toBe(iso)
  })

  it("treats null/empty/invalid as unset (omitted from the push)", () => {
    expect(toTs(null)).toBeUndefined()
    expect(toTs("")).toBeUndefined()
    expect(toTs("not-a-date")).toBeUndefined()
    expect(fromTs(undefined)).toBeNull()
    // seconds may arrive as a string (protojson int64) — still parses.
    expect(fromTs({ seconds: "1781986710", nanos: 0 })).toBe("2026-06-20T20:18:30.000Z")
  })
})

describe("sync push mappers (local row → proto field names)", () => {
  it("project: omits owner_id, maps is_starred to bool, emits tombstone when set", () => {
    const row = {
      id: "p1", title: "T", description: "D", owner_id: "u1",
      category: "screenplay", status: "draft", is_starred: 1,
      created_at: "2026-06-20T20:18:30.527Z", deleted_at: "2026-06-20T21:00:00.000Z",
    }
    const out = pushProject(row)
    expect(out.owner_id).toBeUndefined() // gateway forces the owner
    expect(out.is_starred).toBe(true)
    expect(fromTs(out.deleted_at as { seconds: number })).toBe("2026-06-20T21:00:00.000Z")
  })

  it("element: element_type→type, formatting_json→map, scene_id passthrough", () => {
    const out = pushElement({
      id: "e1", project_id: "p1", scene_id: "s1", element_type: "action",
      content: "hi", line_number: 3, formatting_json: '{"bold":"true"}',
      created_at: "2026-06-20T20:18:30.527Z", deleted_at: null,
    })
    expect(out.type).toBe("action")
    expect(out.formatting).toEqual({ bold: "true" })
    expect(out.scene_id).toBe("s1")
    expect(out.deleted_at).toBeUndefined() // live row, no tombstone
  })

  it("beat: act→act_number, order_index→order", () => {
    const out = pushBeat({
      id: "b1", project_id: "p1", title: "t", description: "", scene_numbers: "",
      color: "#fff", position_x: 10, position_y: 20, width: 200, height: 100,
      act: 2, order_index: 5, start_page: 0, end_page: 0, image_url: null, deleted_at: null,
    })
    expect(out.act_number).toBe(2)
    expect(out.order).toBe(5)
    expect(out.image_url).toBeUndefined()
  })

  it("connection: from_id→from_beat_id, to_id→to_beat_id", () => {
    const out = pushConnection({
      id: "c1", project_id: "p1", from_id: "b1", to_id: "b2",
      from_side: "right", to_side: "left", deleted_at: null,
    })
    expect(out.from_beat_id).toBe("b1")
    expect(out.to_beat_id).toBe("b2")
  })
})
