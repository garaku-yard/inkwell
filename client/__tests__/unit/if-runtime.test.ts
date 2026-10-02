import { describe, expect, it } from "vitest"
import { writeFileSync } from "node:fs"

import {
  applySetStatement,
  diagnoseStory,
  evaluateConditional,
  executePassage,
  parsePassageMetadata,
  renamePassageLinks,
  serializePassageMetadata,
  type IFStorySettings,
} from "@/lib/interactive-fiction/runtime"
import { projectToTwee } from "@/lib/export/if-twee"
import { parseTweeToIF } from "@/lib/import/twee"
import type { FullProject, ProjectElement, Scene } from "@/services/project"

const element = (id: string, type: string, content: string, line = 0): ProjectElement => ({
  id, project_id: "p", scene_id: "start", element_type: type, content, line_number: line,
  formatting: {}, created_at: "2026-01-01", updated_at: "2026-01-01",
})

const scene = (id: string, heading: string, elements: ProjectElement[], content = ""): Scene => ({
  id, project_id: "p", scene_heading: heading, content, order_index: id === "start" ? 0 : 1,
  elements, created_at: "2026-01-01", updated_at: "2026-01-01",
})

describe("Inkwell IF runtime", () => {
  it("executes typed assignments and selects one conditional branch", () => {
    let variables = applySetStatement("{set $gold:number to 10}", {})
    variables = applySetStatement("{set $gold to $gold + 5 * 2}", variables)
    variables = applySetStatement("{set $key:boolean to true}", variables)
    expect(variables.gold).toBe(20)
    expect(evaluateConditional("{if $gold >= 20 and $key: [[Enter -> Vault]] else: [[Leave -> Road]]}", variables)).toBe("[[Enter -> Vault]]")

    const result = executePassage(scene("start", "Start", [
      element("set", "set", "{set $gold:number to 10}", 0),
      element("if", "conditional", "{if $gold > 3: [[Rich -> Vault]] else: [[Poor -> Road]]}", 1),
    ]), {})
    expect(result.variables).toEqual({ gold: 10 })
    expect(result.elements).toEqual([{ id: "if", type: "choice", content: "[[Rich -> Vault]]" }])
    expect(result.events).toHaveLength(2)
    expect(() => applySetStatement("{set $gold to $gold / 0}", variables)).toThrow("Cannot divide by zero")
    expect(() => applySetStatement("{set $mood to uneasy}", variables)).toThrow("must be quoted")
  })

  it("reports broken, unreachable, dead-end, undefined, impossible, and syntax problems", () => {
    const passages = [
      scene("start", "Start", [
        element("broken", "choice", "[[Nowhere]]"),
        element("undefined", "conditional", "{if $missing: [[Yes -> End]] else: [[No -> End]]}"),
        element("impossible", "conditional", "{if false: [[Never -> End]]}"),
        element("syntax", "set", "set nope"),
      ]),
      scene("end", "End", []),
      scene("orphan", "Orphan", []),
    ]
    const kinds = diagnoseStory(passages, { variables: [], testStates: [] }).map((item) => item.kind)
    expect(kinds).toEqual(expect.arrayContaining(["broken-link", "unreachable", "dead-end", "undefined-variable", "impossible-condition", "syntax"]))
  })

  it("explains whether an unreachable passage has no incoming link or only unreachable sources", () => {
    const passages = [
      scene("start", "Start", []),
      scene("orphan", "Orphan", [element("link", "choice", "[[Child]]")]),
      scene("child", "Child", []),
    ]
    const warnings = diagnoseStory(passages, { variables: [], testStates: [] }).filter((item) => item.kind === "unreachable")
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ passageId: "orphan", message: expect.stringContaining("no incoming links") }),
      expect.objectContaining({ passageId: "child", message: expect.stringContaining("Orphan") }),
    ]))
  })

  it("renames only link targets and preserves labels", () => {
    expect(renamePassageLinks("[[Old]] [[Open door -> Old]] [[Old|tooltip]] [[Older]]", "Old", "New")).toBe(
      "[[New]] [[Open door -> New]] [[New|tooltip]] [[Older]]",
    )
  })

  it("round-trips passage and story metadata", () => {
    const settings: IFStorySettings = {
      variables: [{ name: "gold", type: "number", initialValue: 2 }],
      testStates: [{ id: "rich", name: "Rich", passageId: "start", variables: { gold: 99 } }],
    }
    const encoded = serializePassageMetadata({ tags: [" cave ", "cave"], color: "#aabbcc", condition: " On alarm ", note: " Camera pans to the door ", story: settings })
    expect(parsePassageMetadata(encoded)).toEqual({ tags: ["cave"], color: "#aabbcc", condition: "On alarm", note: "Camera pans to the door", story: settings })
  })

  it("exports the same logic as deterministic SugarCube Twee", () => {
    const metadata = serializePassageMetadata({
      tags: ["cave"], color: "#123456",
      story: { variables: [{ name: "gold", type: "number", initialValue: 1 }], testStates: [] },
    })
    const project = {
      id: "11111111-2222-3333-4444-555555555555", title: "Quest", category: "interactive_fiction",
      scenes: [scene("start", "Start", [
        element("set", "set", "{set $gold:number to 10}", 0),
        element("if", "conditional", "{if $gold >= 10: [[Enter -> Vault]] else: [[Leave -> Road]]}", 1),
        element("note", "note", "author only", 2),
      ], metadata)],
    } as FullProject
    const first = projectToTwee(project)
    if (process.env.INKWELL_TWEE_QA_PATH) writeFileSync(process.env.INKWELL_TWEE_QA_PATH, first)
    expect(projectToTwee(project)).toBe(first)
    expect(first).toContain('"ifid": "11111111-2222-5333-8444-555555555555"')
    expect(first).toContain('"start": "Start"')
    expect(first).toContain(":: StoryInit\n<<set $gold = 1>>")
    expect(first).toContain(":: Start [cave] {\"inkwell-color\":\"#123456\"}")
    expect(first).toContain("<<set $gold = 10>>")
    expect(first).toContain("<<if $gold >= 10>>[[Enter -> Vault]]<<else>>[[Leave -> Road]]<</if>>")
    expect(first).not.toContain("author only")

    const imported = parseTweeToIF(first, "Fallback")
    expect(imported.scenes[0].heading).toBe("Start")
    expect(parsePassageMetadata(imported.scenes[0].content)).toMatchObject({
      tags: ["cave"], color: "#123456",
      story: { variables: [{ name: "gold", type: "number", initialValue: 1 }] },
    })
    expect(imported.scenes[0].elements.map((item) => item.type)).toEqual(["set", "conditional"])
  })

  it("keeps author-only passage details out of Play and the Twee body while round-tripping them", () => {
    const metadata = serializePassageMetadata({
      tags: ["sim-trigger"], color: "", condition: "$alarm and camera_ready",
      note: "Cue the door animation\nWait for the player",
    })
    const passage = scene("start", "Door opens", [element("line", "body", "The door opens.")], metadata)
    const played = executePassage(passage, {})
    expect(played.elements.map((item) => item.content)).toEqual(["The door opens."])
    expect(JSON.stringify(played)).not.toContain("Cue the door animation")
    expect(JSON.stringify(played)).not.toContain("camera_ready")

    const exported = projectToTwee({
      id: "p", title: "Sim script", category: "interactive_fiction", scenes: [passage],
    } as FullProject)
    expect(exported).toContain('"inkwell-condition":"$alarm and camera_ready"')
    expect(exported).toContain('"inkwell-note":"Cue the door animation\\nWait for the player"')
    expect(exported.split("\nThe door opens.")[0]).toContain("inkwell-note")
    expect(exported.split("\nThe door opens.")[1]).not.toContain("Cue the door animation")
    expect(parsePassageMetadata(parseTweeToIF(exported, "Fallback").scenes[0].content)).toMatchObject({
      tags: ["sim-trigger"], condition: "$alarm and camera_ready",
      note: "Cue the door animation\nWait for the player",
    })
  })

  it("compiles operators without rewriting quoted text", () => {
    const project = {
      id: "p", title: "Operators", category: "interactive_fiction",
      scenes: [scene("start", "Start", [
        element("text", "set", "{set $phrase:string to \"not and or == !=\"}"),
        element("strict", "conditional", "{if $phrase == \"not and or == !=\": yes else: no}"),
      ])],
    } as FullProject
    const twee = projectToTwee(project)
    expect(twee).toContain('<<set $phrase = "not and or == !=">>')
    expect(twee).toContain('<<if $phrase === "not and or == !=">>yes<<else>>no<</if>>')
    expect(parseTweeToIF(twee, "Fallback").scenes[0].elements.map((item) => item.content)).toEqual([
      '{set $phrase:string to "not and or == !="}',
      '{if $phrase == "not and or == !=": yes else: no}',
    ])
  })

  it("exports and restores an explicit start passage that is not first", () => {
    const metadata = serializePassageMetadata({
      tags: [], color: "",
      story: { startPassageId: "vault", variables: [], testStates: [] },
    })
    const project = {
      id: "p", title: "Alternate start", category: "interactive_fiction",
      scenes: [
        scene("intro", "Introduction", [element("to-vault", "choice", "[[Vault]]")], metadata),
        scene("vault", "Vault", []),
      ],
    } as FullProject

    const twee = projectToTwee(project)
    if (process.env.INKWELL_TWEE_ALT_START_QA_PATH) writeFileSync(process.env.INKWELL_TWEE_ALT_START_QA_PATH, twee)
    expect(twee).toContain('"start": "Vault"')
    expect(twee).toContain(":: Vault\n")
    expect(parseTweeToIF(twee, "Fallback").scenes[0].heading).toBe("Vault")
  })
})
