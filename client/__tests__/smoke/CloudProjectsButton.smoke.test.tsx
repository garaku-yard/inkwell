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

// Vault projects pull through a folder picker — mock the Tauri dialog so the
// dynamic import in handlePull resolves to a chosen path. `confirm` backs the
// non-empty-folder warning; it defaults to "user accepted" so tests that don't
// care about the warning are unaffected.
const pickedFolder = vi.fn(async (..._args: unknown[]) => "/home/me/MyVault" as string | null)
const confirmed = vi.fn(async (..._args: unknown[]) => true)
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...a: unknown[]) => pickedFolder(...a),
  confirm: (...a: unknown[]) => confirmed(...a),
}))

/** A vault slot that reports the folder as empty — the ordinary case, where the
 *  pull proceeds without a warning. */
const emptyFolderVault = () =>
  ({ inspectFolder: vi.fn(async () => ({ fileCount: 0, sample: [] })) }) as never

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
    await waitFor(() =>
      expect(pull).toHaveBeenCalledWith("c1", expect.objectContaining({ meta: expect.objectContaining({ id: "c1" }) })),
    )
    expect(onPulled).toHaveBeenCalled()
  })

  it("pulls a vault project into a chosen folder", async () => {
    const pull = vi.fn(async () => {})
    pickedFolder.mockResolvedValueOnce("/home/me/MyVault")
    const vaultProj: CloudProject = {
      id: "v1", title: "Notes", category: "vault", status: "draft",
      updatedAt: "2026-06-20T00:00:00Z", onThisDevice: false,
    }
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync([vaultProj], true, pull),
      vault: emptyFolderVault(),
    })
    const user = userEvent.setup()
    render(<CloudProjectsButton />)

    await user.click(screen.getByRole("button", { name: /From cloud/ }))
    await waitFor(() => expect(screen.getByText("Notes")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Add" }))

    // The picker ran and the chosen folder flowed into the pull options.
    await waitFor(() =>
      expect(pull).toHaveBeenCalledWith("v1", expect.objectContaining({ vaultFolder: "/home/me/MyVault" })),
    )
    // An empty folder is the safe case — no warning should interrupt it.
    expect(confirmed).not.toHaveBeenCalled()
  })

  it("aborts a vault pull when the folder picker is cancelled", async () => {
    const pull = vi.fn(async () => {})
    pickedFolder.mockResolvedValueOnce(null) // user cancelled
    const vaultProj: CloudProject = {
      id: "v2", title: "Notes2", category: "vault", status: "draft",
      updatedAt: "2026-06-20T00:00:00Z", onThisDevice: false,
    }
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync([vaultProj], true, pull),
      vault: emptyFolderVault(),
    })
    const user = userEvent.setup()
    render(<CloudProjectsButton />)

    await user.click(screen.getByRole("button", { name: /From cloud/ }))
    await waitFor(() => expect(screen.getByText("Notes2")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(pickedFolder).toHaveBeenCalled())
    expect(pull).not.toHaveBeenCalled()
  })

  it("aborts the pull when the user declines a non-empty folder", async () => {
    // The bug this guards (Orbit #152): choosing a folder makes it the vault
    // root, so its existing contents get uploaded. Declining must abort the
    // pull outright — not proceed with the folder anyway.
    const pull = vi.fn(async () => {})
    pickedFolder.mockResolvedValueOnce("/home/me/Downloads")
    confirmed.mockResolvedValueOnce(false) // user reads the warning and backs out
    const vaultProj: CloudProject = {
      id: "v3", title: "Notes3", category: "vault", status: "draft",
      updatedAt: "2026-06-20T00:00:00Z", onThisDevice: false,
    }
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync([vaultProj], true, pull),
      vault: { inspectFolder: vi.fn(async () => ({ fileCount: 42, sample: ["tax-return.pdf"] })) } as never,
    })
    const user = userEvent.setup()
    render(<CloudProjectsButton />)

    await user.click(screen.getByRole("button", { name: /From cloud/ }))
    await waitFor(() => expect(screen.getByText("Notes3")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(confirmed).toHaveBeenCalled())
    expect(pull).not.toHaveBeenCalled()
  })

  it("pulls into a non-empty folder once the user confirms", async () => {
    const pull = vi.fn(async () => {})
    pickedFolder.mockResolvedValueOnce("/home/me/ExistingVault")
    confirmed.mockResolvedValueOnce(true)
    const vaultProj: CloudProject = {
      id: "v4", title: "Notes4", category: "vault", status: "draft",
      updatedAt: "2026-06-20T00:00:00Z", onThisDevice: false,
    }
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync([vaultProj], true, pull),
      vault: { inspectFolder: vi.fn(async () => ({ fileCount: 2, sample: ["a.md", "b.md"] })) } as never,
    })
    const user = userEvent.setup()
    render(<CloudProjectsButton />)

    await user.click(screen.getByRole("button", { name: /From cloud/ }))
    await waitFor(() => expect(screen.getByText("Notes4")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() =>
      expect(pull).toHaveBeenCalledWith("v4", expect.objectContaining({ vaultFolder: "/home/me/ExistingVault" })),
    )
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
