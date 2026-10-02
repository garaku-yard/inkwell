import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { TypedBlockEditor } from "@/components/editor/ttrpg/TypedBlockEditor"

it("links a cross-project reference to its exact target and current label", () => {
  render(<TypedBlockEditor
    block={{ kind: "cross_reference", targetProjectId: "script", targetId: "autopsy", label: "Old title" }}
    currentProjectId="ttrpg" resolvedTargetLabel="Script / Renamed Autopsy" targets={[]}
    onChange={vi.fn()} onNavigate={vi.fn()} />)
  expect(screen.getByRole("link", { name: "See: Script / Renamed Autopsy" }))
    .toHaveAttribute("href", "/projects/editor?id=script&target=autopsy")
})
