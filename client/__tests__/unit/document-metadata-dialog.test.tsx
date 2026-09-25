import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DocumentMetadataDialog } from "@/components/editor/shared/DocumentMetadataDialog"
import type { Scene } from "@/services/project"

const scene = {
  id: "scene-1", project_id: "project-1", scene_heading: "Opening", content: "", order_index: 0,
  created_at: "", updated_at: "",
} as Scene

describe("document metadata dialog", () => {
  it("opens from the keyboard and submits labeled semantic fields", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => {})
    render(<DocumentMetadataDialog scene={scene} label="Chapter" onSave={onSave} />)

    await user.tab()
    expect(screen.getByRole("button", { name: "Chapter metadata" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("dialog", { name: "Chapter metadata" })).toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "Point of view" }), "Mara")
    await user.type(screen.getByRole("textbox", { name: "Tags, separated by commas" }), "draft, review")
    await user.click(screen.getByRole("button", { name: "Save metadata" }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("scene-1", expect.objectContaining({
      pointOfView: "Mara", tags: ["draft", "review"],
    })))
  })
})
