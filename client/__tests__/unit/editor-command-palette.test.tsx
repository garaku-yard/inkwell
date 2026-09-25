import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { EditorCommandPalette } from "@/components/editor/shared/EditorCommandPalette"

describe("editor command palette", () => {
  it("opens with Mod+K, searches, and runs a command with Enter", async () => {
    const user = userEvent.setup()
    const first = vi.fn()
    const second = vi.fn()
    render(<>
      <input aria-label="Manuscript" />
      <EditorCommandPalette commands={[
        { id: "first", label: "Insert paragraph", group: "Insert", run: first },
        { id: "second", label: "Go to second chapter", group: "Navigate", run: second },
      ]} />
    </>)

    await user.click(screen.getByRole("textbox", { name: "Manuscript" }))
    await user.keyboard("{Control>}k{/Control}")
    expect(screen.getByRole("dialog", { name: "Editor commands" })).toBeInTheDocument()
    await user.type(screen.getByRole("combobox", { name: "Search editor commands" }), "second")
    expect(screen.getByText("Go to second chapter")).toBeVisible()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(second).toHaveBeenCalledOnce())
    expect(first).not.toHaveBeenCalled()
  })

  it("returns focus to the manuscript when dismissed", async () => {
    const user = userEvent.setup()
    render(<><input aria-label="Manuscript" /><EditorCommandPalette commands={[]} /></>)
    const manuscript = screen.getByRole("textbox", { name: "Manuscript" })
    await user.click(manuscript)
    await user.keyboard("{Control>}k{/Control}")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(manuscript).toHaveFocus())
  })
})
