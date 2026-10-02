import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PassageGraph } from "@/components/editor/PassageGraph"
import { StoryToolsDialog } from "@/components/editor/if/StoryToolsDialog"
import { serializePassageMetadata } from "@/lib/interactive-fiction/runtime"
import type { Scene } from "@/services/project"

const passage = {
  id: "start", project_id: "p", scene_heading: "Alarm", order_index: 0,
  content: serializePassageMetadata({ tags: ["sim"], color: "", condition: "Alarm level above 2", note: "Queue camera pan" }),
  elements: [], created_at: "", updated_at: "",
} as Scene

describe("IF author-only passage details", () => {
  it("shows trigger and note on graph nodes", () => {
    render(<PassageGraph passages={[passage]} activePassageId="start" onSelectPassage={vi.fn()} />)
    expect(screen.getByText("Alarm level above 2")).toBeInTheDocument()
    expect(screen.getByText("Queue camera pan")).toBeInTheDocument()
  })

  it("traces one passage's links and can show the complete graph", async () => {
    const user = userEvent.setup()
    const makePassage = (id: string, title: string, targets: string[]): Scene => ({
      ...passage, id, scene_heading: title, content: "",
      elements: targets.map((target, index) => ({
        id: `${id}-${index}`, project_id: "p", scene_id: id, element_type: "choice",
        content: `[[${target}]]`, line_number: index, formatting: {}, created_at: "", updated_at: "",
      })),
    })
    const { container } = render(<PassageGraph
      passages={[
        makePassage("start", "Start", ["Branch A", "Branch B"]),
        makePassage("a", "Branch A", ["End"]),
        makePassage("b", "Branch B", ["End"]),
        makePassage("end", "End", []),
      ]}
      activePassageId="start"
      onSelectPassage={vi.fn()}
    />)
    const visibleLinks = () => container.querySelectorAll("path[marker-end]")
    expect(visibleLinks()).toHaveLength(2)
    await user.hover(screen.getAllByText("Branch A")[1])
    expect(visibleLinks()).toHaveLength(2)
    expect(container.querySelector('path[data-from="a"][data-to="end"]')).toBeInTheDocument()
    expect(container.querySelector('path[data-from="start"][data-to="b"]')).not.toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: "Show all links" }))
    expect(visibleLinks()).toHaveLength(4)
  })

  it("edits both fields with the selected passage's other metadata intact", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => {})
    render(<StoryToolsDialog
      open onOpenChange={vi.fn()} passages={[passage]} activePassageId="start"
      runtimePassageId={null} runtimeVariables={{}}
      settings={{ variables: [], testStates: [] }} onSave={onSave}
      onSelectPassage={vi.fn()} onLoadTestState={vi.fn()}
    />)
    const condition = screen.getByRole("textbox", { name: "Trigger / condition" })
    const note = screen.getByRole("textbox", { name: "Author note" })
    expect(condition).toHaveValue("Alarm level above 2")
    expect(note).toHaveValue("Queue camera pan")
    await user.clear(condition)
    await user.type(condition, "On signal S7")
    await user.clear(note)
    await user.type(note, "Hand off to simulation")
    await user.click(screen.getByRole("button", { name: "Save story settings" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ variables: [], testStates: [] }),
      "start",
      expect.objectContaining({ tags: ["sim"], condition: "On signal S7", note: "Hand off to simulation" }),
    ))
  })
})
