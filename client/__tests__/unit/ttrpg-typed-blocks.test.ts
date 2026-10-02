import { expect, it } from "vitest"
import { defaultTtrpgBlock, parseTtrpgBlock, ttrpgBlockToText } from "@/lib/ttrpg/blocks"
import { parseRandomTable, rollRandomTable } from "@/lib/ttrpg/random-table"
import { projectToMarkdown } from "@/lib/export/text-export"
import type { FullProject, ProjectElement } from "@/services/project"

const element = (id: string, element_type: string, content: string): ProjectElement => ({
  id, project_id: "p", scene_id: "s", element_type, content, line_number: 0,
  formatting: {}, created_at: "", updated_at: "",
})

it("uses declared weights for rolls in the editor and connector", () => {
  const table = parseRandomTable("Weight | Result\n--- | ---\n3 | Common\n1 | Rare")
  expect(table?.totalWeight).toBe(4)
  expect(table && rollRandomTable(table, () => 0.5).result).toBe("Common")
  expect(table && rollRandomTable(table, () => 0.9).result).toBe("Rare")
  expect(parseRandomTable("Weight | Result\n0 | Impossible")).toBeNull()
})

it("validates typed block payloads and clock bounds", () => {
  const clock = defaultTtrpgBlock("clock")
  expect(parseTtrpgBlock("ttrpg_clock", JSON.stringify(clock))).toEqual(clock)
  expect(parseTtrpgBlock("ttrpg_clock", JSON.stringify({ ...clock, filled: 7 }))).toBeNull()
  expect(parseTtrpgBlock("ttrpg_clock", "not json")).toBeNull()
  expect(ttrpgBlockToText({ kind: "clock", name: "Ration fuse", segments: 6, filled: 2, note: "" })).toContain("2/6")
})

it("exports new blocks as readable Markdown and follows a renamed target by ID", () => {
  const project: FullProject = {
    id: "p", title: "Attractor", description: "", owner_id: "u", category: "tabletop_rpg",
    status: "draft", is_starred: false, created_at: "", updated_at: "",
    scenes: [{ id: "s", project_id: "p", scene_heading: "Dome", content: "", order_index: 0,
      created_at: "", updated_at: "", elements: [
        element("loc", "ttrpg_keyed_location", JSON.stringify({ kind: "keyed_location", key: "2", name: "New Dome Name", description: "Dark", contents: "Fuse" })),
        element("ref", "ttrpg_cross_reference", JSON.stringify({ kind: "cross_reference", targetId: "loc", label: "Old Name" })),
        element("box", "ttrpg_read_aloud", JSON.stringify({ kind: "read_aloud", text: "The walls hum.", gmNote: "Roll for pressure." })),
      ] }],
  }
  const markdown = projectToMarkdown(project)
  expect(markdown).toContain("2. New Dome Name\nDark\nFound here: Fuse")
  expect(markdown).toContain("See: 2. New Dome Name")
  expect(markdown).toContain("Read aloud: The walls hum.\nGM note: Roll for pressure.")
  expect(markdown).not.toContain("targetId")
})
