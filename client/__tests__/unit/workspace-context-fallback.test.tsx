import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  workspaces: { personal: [] as Array<{ id: string; name: string; type: "personal"; categories: [] }>, org: [] as Array<{ id: string; name: string; type: "org"; categories: [] }> },
  orgs: [] as Array<{ id: string; name: string }>,
}))

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))
vi.mock("@/lib/live-refresh", () => ({ useDataChanged: () => {} }))
vi.mock("@/services/workspace", () => ({
  listUserWorkspaces: async () => h.workspaces,
}))
vi.mock("@/services/organization", () => ({
  listOrganizations: async () => h.orgs,
}))

import { useWorkspace, WorkspaceProvider } from "@/lib/WorkspaceContext"

function ContextState() {
  const { activeWorkspace, activeOrg, needsOnboarding } = useWorkspace()
  return <div>{activeWorkspace?.name ?? "no personal workspace"} · {activeOrg?.name ?? "no organization"} · {needsOnboarding ? "onboarding" : "ready"}</div>
}

beforeEach(() => {
  h.workspaces = { personal: [], org: [] }
  h.orgs = []
  localStorage.clear()
})

describe("workspace context after deleting the last personal workspace", () => {
  it("opens the remaining organization instead of an unfiltered personal view", async () => {
    h.workspaces.org = [{ id: "org", name: "Studio", type: "org", categories: [] }]
    h.orgs = [{ id: "org", name: "Studio" }]
    render(<WorkspaceProvider><ContextState /></WorkspaceProvider>)
    await waitFor(() => expect(screen.getByText("no personal workspace · Studio · ready")).toBeInTheDocument())
  })

  it("returns to onboarding when no workspace or organization remains", async () => {
    render(<WorkspaceProvider><ContextState /></WorkspaceProvider>)
    await waitFor(() => expect(screen.getByText("no personal workspace · no organization · onboarding")).toBeInTheDocument())
  })
})
