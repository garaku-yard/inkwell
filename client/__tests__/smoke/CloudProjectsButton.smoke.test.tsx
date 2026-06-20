import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { CloudProjectsButton } from "@/components/sync/CloudProjectsButton"
import type { CloudProject, SyncStorage } from "@/lib/storage"
import { installFakeStorage } from "../helpers/fake-storage"

function fakeSync(cloud: CloudProject[], available = true, pull = vi.fn(async () => {})): SyncStorage {
  return {
    isAvailable: vi.fn(async () => available),
    getState: vi.fn(async (projectId) => ({ projectId, enabled: false, lastSyncedAt: null, status: "idle" as const })),
    listEnabled: vi.fn(async () => []),
    setEnabled: vi.fn(async () => {}),
    syncProject: vi.fn(async (projectId) => ({ projectId, enabled: true, lastSyncedAt: null, status: "idle" as const })),
    syncAll: vi.fn(async () => []),
    listCloudProjects: vi.fn(async () => cloud),
    pullProject: pull,
  }
}

const proj = (id: string, title: string, onThisDevice = false): CloudProject => ({
  id, title, category: "screenplay", status: "draft", updatedAt: "2026-06-20T00:00:00Z", onThisDevice,
})

describe("CloudProjectsButton", () => {
  it("renders nothing without the sync capability (web build)", () => {
    installFakeStorage({ capabilities: new Set(["ai.byo"]) })
    const { container } = render(<CloudProjectsButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists cloud-only projects and pulls one onto the device", async () => {
    const pull = vi.fn(async () => {})
    const onPulled = vi.fn()
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync([proj("c1", "Cloud One"), proj("c2", "Already Here", true)], true, pull),
    })
    const user = userEvent.setup()
    render(<CloudProjectsButton onPulled={onPulled} />)

    await user.click(screen.getByRole("button", { name: /From cloud/ }))

    // Cloud-only project shows; the already-on-device one is filtered out.
    await waitFor(() => expect(screen.getByText("Cloud One")).toBeInTheDocument())
    expect(screen.queryByText("Already Here")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(pull).toHaveBeenCalledWith("c1"))
    expect(onPulled).toHaveBeenCalled()
  })

  it("prompts for sign-in when no account is linked", async () => {
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync([], /* available */ false),
    })
    const user = userEvent.setup()
    render(<CloudProjectsButton />)
    await user.click(screen.getByRole("button", { name: /From cloud/ }))
    await waitFor(() => expect(screen.getByText(/Sign in to a cloud account/)).toBeInTheDocument())
  })
})
