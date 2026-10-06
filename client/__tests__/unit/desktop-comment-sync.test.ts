// @vitest-environment node
import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ getDb: vi.fn(), apiClient: vi.fn() }))
vi.mock("@/lib/storage/local/shared", () => ({
  getDb: h.getDb, newId: () => crypto.randomUUID(), now: () => new Date().toISOString(),
}))
vi.mock("@/lib/api", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/api")>(), apiClient: h.apiClient,
}))

import { ApiError } from "@/lib/api"
import { collaboration } from "@/lib/storage/local/collaboration"
import { syncProjectComments } from "@/lib/storage/local/comment-sync"

type BindValue = string | number | null
type Row = Record<string, unknown>
const projectId = "11111111-1111-4111-8111-111111111111"
const sceneId = "22222222-2222-4222-8222-222222222222"
const elementId = "33333333-3333-4333-8333-333333333333"
const accountId = "44444444-4444-4444-8444-444444444444"

function device() {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE scenes (id TEXT PRIMARY KEY, project_id TEXT, deleted_at TEXT);
    CREATE TABLE script_elements (id TEXT PRIMARY KEY, project_id TEXT, deleted_at TEXT);
  `)
  sqlite.exec(readFileSync("src-tauri/migrations/0010_sync_state.sql", "utf8"))
  sqlite.exec(readFileSync("src-tauri/migrations/0020_local_comments.sql", "utf8"))
  sqlite.exec(readFileSync("src-tauri/migrations/0021_local_comment_sync.sql", "utf8"))
  sqlite.prepare("INSERT INTO projects (id) VALUES (?)").run(projectId)
  sqlite.prepare("INSERT INTO scenes (id, project_id) VALUES (?, ?)").run(sceneId, projectId)
  sqlite.prepare("INSERT INTO script_elements (id, project_id) VALUES (?, ?)").run(elementId, projectId)
  sqlite.prepare("INSERT INTO sync_state (project_id, enabled, updated_at) VALUES (?, 1, ?)").run(projectId, new Date().toISOString())
  return {
    sqlite,
    db: {
      select: async <T>(sql: string, params: BindValue[] = []) => sqlite.prepare(sql).all(...params) as T,
      execute: async (sql: string, params: BindValue[] = []) => sqlite.prepare(sql).run(...params),
    },
  }
}

describe("desktop hosted comment sync", () => {
  let first: ReturnType<typeof device>
  let second: ReturnType<typeof device>
  let active: ReturnType<typeof device>
  let hosted: Map<string, Row>
  let loseFirstCreateResponse: boolean
  let signedInAccount: string

  beforeEach(() => {
    first = device()
    second = device()
    active = first
    hosted = new Map()
    loseFirstCreateResponse = false
    signedInAccount = accountId
    h.getDb.mockReset().mockImplementation(async () => active.db)
    h.apiClient.mockReset().mockImplementation(async (path: string, options: { method?: string; body?: Row } = {}) => {
      if (path === "users/me") return { user: { id: signedInAccount } }
      if (path === "comments" && options.method === "POST") {
        const body = options.body ?? {}
        const id = String(body.client_comment_id)
        if (!hosted.has(id)) hosted.set(id, {
          id, project_id: body.project_id, script_element_id: body.script_element_id,
          scene_id: body.scene_id, user_id: signedInAccount, username: "Author",
          content: body.content, is_resolved: false, created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        if (loseFirstCreateResponse) {
          loseFirstCreateResponse = false
          throw new Error("response lost after commit")
        }
        return hosted.get(id)
      }
      if (path.startsWith("comments?") && options.method === "GET") {
        const offset = Number(new URLSearchParams(path.split("?")[1]).get("offset"))
        return [...hosted.values()].slice(offset, offset + 100)
      }
      if (path.startsWith("comments/")) {
        const id = path.slice("comments/".length)
        const comment = hosted.get(id)
        if (!comment) throw new ApiError(404, "NOT_FOUND", "Comment not found")
        if (options.method === "DELETE") { hosted.delete(id); return { success: true } }
        if (options.method === "PATCH") {
          if (options.body?.content !== undefined) comment.content = options.body.content
          if (options.body?.is_resolved !== undefined) comment.is_resolved = options.body.is_resolved
          return comment
        }
      }
      throw new Error(`Unexpected API call: ${options.method} ${path}`)
    })
  })

  it("carries element comments, edits, resolution, and deletion between two devices", async () => {
    const comment = await collaboration.addComment({ projectId, screenplayId: projectId, scriptElementId: elementId,
      content: "Check the TRIGGER", lineNumber: 0 })
    await expect(collaboration.addComment({ projectId, screenplayId: projectId, scriptElementId: crypto.randomUUID(),
      content: "Foreign target", lineNumber: 0 })).rejects.toThrow("not in this project")
    await syncProjectComments(projectId)
    active = second
    await syncProjectComments(projectId)
    expect(await collaboration.listComments(projectId)).toMatchObject([{ id: comment.id, elementId, content: "Check the TRIGGER" }])

    active = first
    await collaboration.updateComment(comment.id, { content: "Move the TRIGGER", isResolved: true })
    await syncProjectComments(projectId)
    active = second
    await syncProjectComments(projectId)
    expect(await collaboration.listComments(projectId)).toMatchObject([{ content: "Move the TRIGGER", isResolved: true }])

    await collaboration.updateComment(comment.id, { isResolved: false })
    await syncProjectComments(projectId)
    active = first
    await syncProjectComments(projectId)
    expect(await collaboration.listComments(projectId)).toMatchObject([{ isResolved: false }])

    active = second
    await collaboration.deleteComment(comment.id)
    expect(await collaboration.listComments(projectId)).toEqual([])
    await syncProjectComments(projectId)
    active = first
    await syncProjectComments(projectId)
    expect(await collaboration.listComments(projectId)).toEqual([])
  })

  it("retries a committed create with the same ID after losing its response", async () => {
    const comment = await collaboration.addComment({ projectId, screenplayId: projectId, sceneId,
      content: "Opening note", lineNumber: 0 })
    loseFirstCreateResponse = true
    await expect(syncProjectComments(projectId)).rejects.toThrow("response lost")
    expect(hosted.size).toBe(1)
    await collaboration.updateComment(comment.id, { content: "Edited after lost response" })
    await syncProjectComments(projectId)
    expect(hosted.size).toBe(1)
    expect(hosted.get(comment.id)?.content).toBe("Edited after lost response")
    active = second
    await syncProjectComments(projectId)
    expect(await collaboration.listComments(projectId)).toMatchObject([{ id: comment.id, elementId: sceneId, isScene: true }])
  })

  it("paginates the full hosted list and rejects edits to another author's comment", async () => {
    for (let i = 0; i < 101; i++) {
      const id = crypto.randomUUID()
      hosted.set(id, { id, project_id: projectId, script_element_id: elementId,
        user_id: "55555555-5555-4555-8555-555555555555", username: "Other writer",
        content: `Note ${i}`, is_resolved: false, created_at: new Date().toISOString(),
        updated_at: new Date().toISOString() })
    }
    await syncProjectComments(projectId)
    const comments = await collaboration.listComments(projectId)
    expect(comments).toHaveLength(101)
    expect(comments[0].canEdit).toBe(false)
    await expect(collaboration.updateComment(comments[0].id, { content: "Changed" })).rejects.toThrow("Only the comment author")
  })

  it("removes an offline comment deleted before its first upload", async () => {
    const comment = await collaboration.addComment({ projectId, screenplayId: projectId, sceneId,
      content: "Discard me", lineNumber: 0 })
    await collaboration.deleteComment(comment.id)
    await syncProjectComments(projectId)
    expect(hosted.size).toBe(0)
    expect(await collaboration.listComments(projectId)).toEqual([])
  })

  it("keeps unsent edits tied to their account and reloads confirmed copies after a switch", async () => {
    const comment = await collaboration.addComment({ projectId, screenplayId: projectId, sceneId,
      content: "First account", lineNumber: 0 })
    await syncProjectComments(projectId)
    signedInAccount = "66666666-6666-4666-8666-666666666666"
    await syncProjectComments(projectId)
    expect((await collaboration.listComments(projectId))[0]).toMatchObject({ id: comment.id, canEdit: false })

    signedInAccount = accountId
    await syncProjectComments(projectId)
    await collaboration.updateComment(comment.id, { content: "Unsent edit" })
    signedInAccount = "66666666-6666-4666-8666-666666666666"
    await expect(syncProjectComments(projectId)).rejects.toThrow("unsent comments from another account")
    expect((await collaboration.listComments(projectId))[0].content).toBe("Unsent edit")
  })
})
