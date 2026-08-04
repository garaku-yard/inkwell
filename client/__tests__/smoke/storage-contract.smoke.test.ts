import { describe, expect, it } from "vitest"

import { createRemoteStorage } from "@/lib/storage/remote"

// Regression guard for the per-domain storage split: assert the remote
// implementation still wires every domain key and a few representative
// methods after the refactor. We exercise the remote impl only — the
// local impl pulls in @tauri-apps/plugin-sql which can't load outside a
// Tauri webview.
describe("storage contract", () => {
  const storage = createRemoteStorage()

  it("exposes every domain key", () => {
    expect(storage.auth).toBeDefined()
    expect(storage.projects).toBeDefined()
    expect(storage.scenes).toBeDefined()
    expect(storage.elements).toBeDefined()
    expect(storage.characters).toBeDefined()
    expect(storage.locations).toBeDefined()
    expect(storage.beatBoard).toBeDefined()
    expect(storage.workspaces).toBeDefined()
    expect(storage.collaboration).toBeDefined()
    expect(storage.settings).toBeDefined()
    expect(storage.vault).toBeDefined()
    expect(storage.ai).toBeDefined()
    expect(storage.admin.billing).toBeDefined()
  })

  it("wires representative methods as functions", () => {
    expect(typeof storage.projects.listOwned).toBe("function")
    expect(typeof storage.projects.getFull).toBe("function")
    expect(typeof storage.scenes.create).toBe("function")
    expect(typeof storage.vault.listNotes).toBe("function")
    expect(typeof storage.vault.getBacklinks).toBe("function")
    expect(typeof storage.ai.streamChat).toBe("function")
    expect(typeof storage.ai.listProviderSettings).toBe("function")
    expect(typeof storage.admin.billing.getTiers).toBe("function")
  })

  it("declares the expected capabilities", () => {
    expect(storage.capabilities.has("auth")).toBe(true)
    expect(storage.capabilities.has("ai.byo")).toBe(true)
  })

  // Orgs themselves are gateway-backed on both builds (ADR 0023), but only the
  // remote build owns the org *project pool* — the desktop must not offer to
  // create a project into an org, since its projects table has no org column.
  it("owns org-owned projects, unlike the desktop build", () => {
    expect(storage.capabilities.has("organizations")).toBe(true)
    expect(storage.capabilities.has("organizations.projects")).toBe(true)
  })
})
