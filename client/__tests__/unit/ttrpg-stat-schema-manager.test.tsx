import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { StatSchemaManager } from "@/components/editor/ttrpg/StatSchemaManager"

describe("stat schema manager", () => {
  it("opens a new form explicitly and can start another after selecting a template", async () => {
    const user = userEvent.setup()
    render(<StatSchemaManager open onOpenChange={vi.fn()} schemas={[{ id: "fault", name: "Fault", fields: [] }]}
      onSave={vi.fn(async () => {})} onInsert={vi.fn(async () => {})} />)

    expect(screen.queryByRole("textbox", { name: "Template name" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Create new template" }))
    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("")

    await user.click(screen.getByRole("button", { name: "Fault" }))
    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("Fault")
    await user.click(screen.getByRole("button", { name: "Start another template" }))
    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("")
  })
})
