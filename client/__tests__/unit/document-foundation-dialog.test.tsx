import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DocumentFoundationDialog } from "@/components/editor/shared/DocumentFoundationDialog"
import { captureDocumentRevision } from "@/lib/editor/document-foundation"
import type { Scene } from "@/services/project"

const scene = {
  id: "s1", project_id: "p1", scene_heading: "Draft", content: "", order_index: 0,
  created_at: "", updated_at: "", elements: [],
} as Scene

describe("document foundation dialog", () => {
  it("supports keyboard access to templates and named snapshots", async () => {
    const user = userEvent.setup()
    const onTemplate = vi.fn(async () => {})
    const onCapture = vi.fn(async () => {})
    render(<DocumentFoundationDialog category="poetry" scene={scene} onTemplate={onTemplate} onCapture={onCapture} onVariant={vi.fn(async () => {})} />)
    await user.tab()
    expect(screen.getByRole("button", { name: "Templates and revisions" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("dialog", { name: "Templates & revisions" })).toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "Use" })[0])
    await waitFor(() => expect(onTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "free-verse" })))

    await user.click(screen.getByRole("button", { name: "Templates and revisions" }))
    await user.type(screen.getByRole("textbox", { name: "Revision name" }), "First pass")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(onCapture).toHaveBeenCalledWith("s1", "First pass"))
  })

  it("offers saved revisions as non-destructive variants", async () => {
    const user = userEvent.setup()
    const revision = { ...scene, content: captureDocumentRevision(scene, "First pass", "r1", "2026-09-25T00:00:00Z") }
    const onVariant = vi.fn(async () => {})
    render(<DocumentFoundationDialog category="prose" scene={revision} onTemplate={vi.fn(async () => {})} onCapture={vi.fn(async () => {})} onVariant={onVariant} />)
    await user.click(screen.getByRole("button", { name: "Templates and revisions" }))
    await user.click(screen.getByRole("button", { name: "Open as variant" }))
    await waitFor(() => expect(onVariant).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", label: "First pass" })))
  })
})
