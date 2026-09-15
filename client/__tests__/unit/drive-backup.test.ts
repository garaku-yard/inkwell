import { beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({
  calls: [] as Array<{ command: string; args?: Record<string, unknown> }>,
  state: { account_email: null as string | null, root_folder_id: null as string | null,
    status: "idle", error: null as string | null, last_backup_at: null as string | null },
  projectFolder: null as { drive_folder_id: string; folder_name: string } | null,
  folders: new Map<string, string>(),
  mappings: new Map<string, { path: string; drive_file_id: string; synced_hash: string }>(),
  category: "vault",
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    harness.calls.push({ command, args })
    if (command === "google_drive_status") return { connected: true, accountEmail: "writer@example.com" }
    if (command === "google_drive_file_exists") return true
    if (command === "google_drive_create_folder") return `folder-${harness.calls.filter(c => c.command === command).length}`
    if (command === "google_drive_upsert_file") return { fileId: "drive-file-1", created: true }
    throw new Error(`unexpected command ${command}`)
  }),
}))

vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn(async () => new TextEncoder().encode("hello")) }))
vi.mock("@/lib/tauri-scope", () => ({ allowFsDir: vi.fn(async () => {}) }))
vi.mock("@/lib/storage/local/vault", () => ({
  walkVaultFiles: vi.fn(async () => [{ rel: "chapters/one.md", abs: "/vault/chapters/one.md" }]),
}))
vi.mock("@/lib/export/iw", () => ({
  projectExportSlug: () => "novel",
  buildProjectIw: vi.fn(async () => ({
    project: { title: "Novel", description: "", category: "novel", scenes: [] },
    iw: { format: "inkwell-project", version: 2, exportedAt: "now", project: { title: "Novel" } },
    content: "{\"format\":\"inkwell-project\"}",
  })),
}))
vi.mock("@/lib/export/generic-pdf", () => ({
  renderGenericPdfBytes: vi.fn(() => new Uint8Array([37, 80, 68, 70])),
}))
vi.mock("@/lib/export/screenplay-pdf", () => ({
  renderScreenplayPdfBytes: vi.fn(() => new Uint8Array([37, 80, 68, 70])),
}))
vi.mock("@/lib/iw/format", () => ({ serializeIw: (value: unknown) => JSON.stringify(value) }))
vi.mock("@/lib/storage/local/shared", () => ({
  now: () => "2026-09-15T12:00:00.000Z",
  getDb: async () => ({
    select: async (sql: string) => {
      if (sql.includes("FROM drive_state")) return [{ ...harness.state }]
      if (sql.includes("FROM projects")) return [{ id: "p1", title: "Novel", category: harness.category,
        vault_path: harness.category === "vault" ? "/vault" : null }]
      if (sql.includes("FROM drive_project")) return harness.projectFolder ? [harness.projectFolder] : []
      if (sql.includes("FROM drive_folder")) return Array.from(harness.folders, ([path, drive_folder_id]) => ({ path, drive_folder_id }))
      if (sql.includes("FROM drive_backup")) return Array.from(harness.mappings.values())
      throw new Error(`unexpected select: ${sql}`)
    },
    execute: async (sql: string, args: unknown[] = []) => {
      if (sql.includes("SET account_email")) {
        harness.state.account_email = args[0] as string
        harness.state.root_folder_id = args[1] as string
      } else if (sql.includes("INSERT INTO drive_project")) {
        harness.projectFolder = { drive_folder_id: args[1] as string, folder_name: args[2] as string }
      } else if (sql.includes("INSERT INTO drive_folder")) {
        harness.folders.set(args[1] as string, args[2] as string)
      } else if (sql.includes("INSERT INTO drive_backup")) {
        harness.mappings.set(args[1] as string, {
          path: args[1] as string, drive_file_id: args[2] as string, synced_hash: args[3] as string,
        })
      } else if (sql.includes("last_backup_at")) {
        harness.state.status = "idle"
        harness.state.last_backup_at = args[0] as string
      } else if (sql.includes("status = 'backing_up'")) harness.state.status = "backing_up"
      else if (sql.includes("status = 'error'")) harness.state.status = "error"
      else if (sql.includes("status = 'idle'")) harness.state.status = "idle"
      return { rowsAffected: 1 }
    },
  }),
}))

import { backupSelectedProjectsToDrive } from "@/lib/drive-backup"

describe("Google Drive vault backup", () => {
  beforeEach(() => {
    harness.calls.length = 0
    harness.state = { account_email: null, root_folder_id: null, status: "idle", error: null, last_backup_at: null }
    harness.projectFolder = null
    harness.folders.clear()
    harness.mappings.clear()
    harness.category = "vault"
  })

  it("preserves nested folders and skips byte-identical files on the next run", async () => {
    const first = await backupSelectedProjectsToDrive()
    expect(first).toMatchObject({ projects: 1, uploaded: 1, unchanged: 0 })
    const upload = harness.calls.find(call => call.command === "google_drive_upsert_file")
    expect(upload?.args?.upload).toMatchObject({ name: "one.md", parentId: "folder-3", contentType: "text/markdown" })

    const second = await backupSelectedProjectsToDrive()
    expect(second).toMatchObject({ projects: 1, uploaded: 0, unchanged: 1 })
    expect(harness.calls.filter(call => call.command === "google_drive_upsert_file")).toHaveLength(1)
  })

  it("uploads lossless .iw and readable PDF artifacts for non-vault projects", async () => {
    harness.category = "novel"
    const result = await backupSelectedProjectsToDrive()

    expect(result).toMatchObject({ projects: 1, uploaded: 2, unchanged: 0 })
    const uploads = harness.calls
      .filter(call => call.command === "google_drive_upsert_file")
      .map(call => call.args?.upload as { name: string; contentType: string })
    expect(uploads).toEqual([
      expect.objectContaining({ name: "novel.iw", contentType: "application/json" }),
      expect.objectContaining({ name: "novel.pdf", contentType: "application/pdf" }),
    ])
  })

  it("stops cleanly when cancellation is requested", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(backupSelectedProjectsToDrive(undefined, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(harness.state.status).toBe("idle")
    expect(harness.calls.some(call => call.command === "google_drive_create_folder")).toBe(false)
  })
})
