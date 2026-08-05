/**
 * Frontend half of the MCP bridge (ADR 0025).
 *
 * The Rust side owns the loopback socket and the token; it can't run a tool,
 * because the tools are TypeScript over the Storage layer and only work in
 * here. So it forwards each call as an `mcp:request` event and this module
 * answers through the `mcp_reply` command.
 *
 * What it speaks is MCP's own result shapes, so the stdio shim outside stays a
 * dumb forwarder with no knowledge of Inkwell in it.
 *
 * ## Choosing a project
 *
 * Most tools act on one project, and an external agent — unlike the in-app
 * chat — isn't already sitting in one. Rather than adding a `project_id`
 * argument to every tool (which would fork the specs the chat sees), the
 * bridge keeps a chosen project for the session and exposes `use_project` to
 * set it. That tool is the bridge's own, not a registry entry: it manages
 * bridge state, not the writer's data, and would mean nothing to the chat.
 */

import { allTools, findTool, type ToolArgs } from "@/lib/storage/local/tools"

/** The project subsequent calls act on. Null until the agent chooses one. */
let chosenProject: string | null = null

interface McpContent {
  type: "text"
  text: string
}

interface McpResult {
  content: McpContent[]
  isError?: boolean
}

function text(body: string, isError = false): McpResult {
  return isError ? { content: [{ type: "text", text: body }], isError: true } : { content: [{ type: "text", text: body }] }
}

/** The bridge's own tool for choosing what the rest act on. */
const USE_PROJECT = {
  name: "use_project",
  description:
    "Choose which project the other tools act on for the rest of this " +
    "session. Call list_projects first to find an id. Everything except " +
    "list_projects needs a project chosen.",
  inputSchema: {
    type: "object",
    properties: {
      project_id: {
        type: "string",
        description: "The project's id, as returned by list_projects.",
      },
    },
    required: ["project_id"],
  },
  annotations: { readOnlyHint: true },
}

function toolList(): unknown {
  const registered = allTools().map((entry) => ({
    name: entry.spec.name,
    description: entry.spec.description,
    inputSchema: entry.spec.parameters,
    // The registry already records which tools write; MCP clients use this to
    // decide what to confirm, which is the whole reason `mutates` exists.
    annotations: { readOnlyHint: !entry.mutates, destructiveHint: false },
  }))
  return { tools: [USE_PROJECT, ...registered] }
}

async function callTool(params: Record<string, unknown>): Promise<McpResult> {
  const name = typeof params.name === "string" ? params.name : ""
  const args = (params.arguments ?? {}) as ToolArgs

  if (name === USE_PROJECT.name) {
    const id = typeof args.project_id === "string" ? args.project_id.trim() : ""
    if (!id) return text("Give a project_id. list_projects has the ids.", true)
    // Proven by use: reading the project's own scenes fails loudly for an id
    // that isn't a project, which beats accepting it and failing later on
    // every call.
    const { projects } = await import("@/lib/storage/local/projects")
    try {
      const project = await projects.getById(id, "")
      chosenProject = id
      return text(`Working on "${project.title}" (${project.category}).`)
    } catch {
      return text(`No project has the id "${id}". Call list_projects to see them.`, true)
    }
  }

  const tool = findTool(name)
  if (!tool) return text(`Unknown tool: ${name}`, true)

  if (tool.scope !== "account" && !chosenProject) {
    return text(`Choose a project first: call use_project. ${name} acts on one project.`, true)
  }

  try {
    return text(await tool.run(args, { projectId: chosenProject ?? "" }))
  } catch (err) {
    // A handler that throws is a bug or a broken database, not an answer.
    // Report it as a failed call so the agent sees it instead of a silence.
    return text(`${name} failed: ${(err as Error).message}`, true)
  }
}

async function handle(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "tools/list":
      return toolList()
    case "tools/call":
      return await callTool(params)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
}

interface RequestPayload {
  id: string
  method: string
  params: Record<string, unknown>
}

/** Starts answering bridge requests. Returns an unsubscribe function. */
export async function startMcpBridge(): Promise<() => void> {
  const [{ listen }, { invoke }] = await Promise.all([
    import("@tauri-apps/api/event"),
    import("@tauri-apps/api/core"),
  ])

  return await listen<RequestPayload>("mcp:request", (event) => {
    const { id, method, params } = event.payload
    void (async () => {
      let result: unknown
      try {
        result = await handle(method, params ?? {})
      } catch (err) {
        result = text((err as Error).message, true)
      }
      // If this throws the Rust side is already gone (timed out, shutting
      // down); there is nowhere left to report it.
      await invoke("mcp_reply", { id, result }).catch(() => {})
    })()
  })
}

/** Test seam: the chosen project is module state, so tests need to clear it. */
export function __resetBridgeForTests(): void {
  chosenProject = null
}

export const __testables = { handle }
