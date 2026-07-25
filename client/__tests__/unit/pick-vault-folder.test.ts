/** The folder picker's safety guard (Orbit #152).
 *
 *  Choosing a folder makes it the vault root, so anything already inside it
 *  becomes vault content and is uploaded. A real user picked ~/Downloads and it
 *  began uploading it — the only thing that stopped it was an unrelated size
 *  bug. The warning is the actual safeguard here, so both the decision logic
 *  and the wording are pinned. */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { existingContentWarning, pickVaultFolder } from "@/lib/vault/pick-vault-folder"
import { installFakeStorage } from "../helpers/fake-storage"

const open = vi.fn(async (..._a: unknown[]) => "/home/me/folder" as string | null)
const confirm = vi.fn(async (..._a: unknown[]) => true)
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...a: unknown[]) => open(...a),
  confirm: (...a: unknown[]) => confirm(...a),
}))

const withFolder = (fileCount: number, sample: string[] = []) =>
  installFakeStorage({
    vault: { inspectFolder: vi.fn(async () => ({ fileCount, sample })) } as never,
  })

/** A vault slot whose inspection blows up — e.g. the folder can't be read. */
const withUnreadableFolder = () =>
  installFakeStorage({
    vault: {
      inspectFolder: vi.fn(async () => {
        throw new Error("EACCES")
      }),
    } as never,
  })

beforeEach(() => {
  open.mockClear()
  confirm.mockClear()
  open.mockResolvedValue("/home/me/folder")
  confirm.mockResolvedValue(true)
})

describe("pickVaultFolder", () => {
  it("returns null when the picker is cancelled", async () => {
    open.mockResolvedValueOnce(null)
    withFolder(0)
    expect(await pickVaultFolder({ title: "t", willUpload: true })).toBeNull()
    expect(confirm).not.toHaveBeenCalled()
  })

  it("adopts an empty folder without warning", async () => {
    withFolder(0)
    expect(await pickVaultFolder({ title: "t", willUpload: true })).toBe("/home/me/folder")
    expect(confirm).not.toHaveBeenCalled()
  })

  it("warns before adopting a folder that already has files", async () => {
    withFolder(3, ["a.md", "b.md", "c.md"])
    expect(await pickVaultFolder({ title: "t", willUpload: true })).toBe("/home/me/folder")
    expect(confirm).toHaveBeenCalledOnce()
  })

  it("returns null — not the path — when the user declines the warning", async () => {
    // Returning the path anyway would defeat the whole guard.
    withFolder(9, ["secret.pdf"])
    confirm.mockResolvedValueOnce(false)
    expect(await pickVaultFolder({ title: "t", willUpload: true })).toBeNull()
  })

  it("does not warn when nothing would be uploaded", async () => {
    // Pointing a local, unsynced project at an existing vault is the ordinary
    // way to open one — warning there would be pure noise.
    const storage = withFolder(500, ["everything.md"])
    expect(await pickVaultFolder({ title: "t", willUpload: false })).toBe("/home/me/folder")
    expect(confirm).not.toHaveBeenCalled()
    // It shouldn't even look, since the answer can't change the outcome.
    expect(storage.vault.inspectFolder).not.toHaveBeenCalled()
  })

  it("asks rather than silently proceeding when the folder can't be inspected", async () => {
    // Failing open here would restore exactly the behaviour being fixed.
    withUnreadableFolder()
    confirm.mockResolvedValueOnce(false)
    expect(await pickVaultFolder({ title: "t", willUpload: true })).toBeNull()
    expect(confirm).toHaveBeenCalledOnce()
  })
})

describe("existingContentWarning", () => {
  it("says the files will be uploaded, in those words", async () => {
    const msg = existingContentWarning({ fileCount: 2, sample: ["a.md", "b.md"] })
    expect(msg).toMatch(/uploaded to the cloud/)
    // The user's mental model is "download into here" — the message has to
    // contradict it explicitly, not just describe the upload.
    expect(msg).toMatch(/not a download/)
  })

  it("names the files it found so the user can recognise the folder", () => {
    const msg = existingContentWarning({ fileCount: 2, sample: ["tax.pdf", "notes.md"] })
    expect(msg).toContain("tax.pdf")
    expect(msg).toContain("notes.md")
  })

  it("summarises the tail instead of listing everything", () => {
    const msg = existingContentWarning({
      fileCount: 40,
      sample: ["a", "b", "c", "d", "e"],
    })
    expect(msg).toContain("40 files")
    expect(msg).toContain("…and 37 more")
    expect(msg).not.toContain("  • d")
  })

  it("uses the singular for one file", () => {
    const msg = existingContentWarning({ fileCount: 1, sample: ["only.md"] })
    expect(msg).toContain("1 file:")
    expect(msg).not.toContain("…and")
  })
})
