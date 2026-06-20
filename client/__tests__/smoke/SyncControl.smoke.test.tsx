import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

import { SyncControl } from "@/components/sync/SyncControl"
import type { SyncProjectState, SyncStorage } from "@/lib/storage"
import { installFakeStorage } from "../helpers/fake-storage"

function fakeSync(state: Partial<SyncProjectState>, available = true): SyncStorage {
  const full: SyncProjectState = {
    projectId: "p1", enabled: false, lastSyncedAt: null, status: "idle", ...state,
  }
  return {
    isAvailable: vi.fn(async () => available),
    getState: vi.fn(async () => full),
    listEnabled: vi.fn(async () => []),
    setEnabled: vi.fn(async () => {}),
    syncProject: vi.fn(async () => full),
    syncAll: vi.fn(async () => []),
  }
}

describe("SyncControl", () => {
  it("renders nothing when the sync capability is absent (web build)", () => {
    installFakeStorage({ capabilities: new Set(["ai.byo"]) })
    const { container } = render(<SyncControl projectId="p1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a synced status once an enabled project resolves", async () => {
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync({ enabled: true, status: "idle", lastSyncedAt: new Date().toISOString() }),
    })
    render(<SyncControl projectId="p1" />)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cloud sync — Synced/ })).toBeInTheDocument(),
    )
  })

  it("reflects a not-signed-in state", async () => {
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync({}, /* available */ false),
    })
    render(<SyncControl projectId="p1" />)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Not signed in/ })).toBeInTheDocument(),
    )
  })

  it("surfaces an error status", async () => {
    installFakeStorage({
      capabilities: new Set(["sync"]),
      sync: fakeSync({ enabled: true, status: "error", error: "boom" }),
    })
    render(<SyncControl projectId="p1" />)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /boom/ })).toBeInTheDocument(),
    )
  })
})
