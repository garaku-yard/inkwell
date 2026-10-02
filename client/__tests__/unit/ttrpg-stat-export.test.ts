import { expect, it } from "vitest"
import { projectToMarkdown } from "@/lib/export/text-export"
import type { FullProject } from "@/services/project"

it("exports a structured stat block as readable fields and keeps legacy blocks", () => {
  const project: FullProject = {
    id: "p", title: "Attractor", owner_id: "u", category: "tabletop_rpg",
    description: "", status: "draft", is_starred: false, created_at: "", updated_at: "",
    ttrpg_stat_schemas: [{ id: "fault", name: "Fault", fields: [
      { id: "trigger", label: "Trigger", kind: "text" },
      { id: "status", label: "Status", kind: "choice", options: ["draft", "designed"] },
    ] }],
    scenes: [{ id: "s", project_id: "p", scene_heading: "The Dome", content: "", order_index: 0,
      created_at: "", updated_at: "", elements: [
        { id: "e1", project_id: "p", scene_id: "s", element_type: "ttrpg_stat",
          content: JSON.stringify({ schemaId: "fault", name: "Liner Seep", values: { trigger: "Pressure drop", status: "designed" } }),
          line_number: 0, formatting: {}, created_at: "", updated_at: "" },
        { id: "e2", project_id: "p", scene_id: "s", element_type: "stat_block",
          content: "Old freeform stat", line_number: 1, formatting: {}, created_at: "", updated_at: "" },
      ] }],
  }
  const markdown = projectToMarkdown(project)
  expect(markdown).toContain("Liner Seep\nTrigger: Pressure drop\nStatus: designed")
  expect(markdown).toContain("Old freeform stat")
  expect(markdown).not.toContain("schemaId")
})
