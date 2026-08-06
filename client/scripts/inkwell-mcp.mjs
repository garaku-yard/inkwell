#!/usr/bin/env node
/**
 * Inkwell MCP shim — speaks MCP over stdio to a client (Claude Code, say) and
 * forwards each call to the bridge inside the running desktop app (ADR 0025).
 *
 * It is deliberately thin: it knows how to find the app and how to frame
 * JSON-RPC, and nothing about writing. The tools, their descriptions and their
 * results all come from the app's registry, so adding a capability needs no
 * change here.
 *
 * The app must be running. That is the accepted trade in 0025 — the point is
 * to act on the editor that's open, and a standalone server would need its own
 * SQLite implementation of every operation and would write behind the running
 * app's back.
 *
 * Handshake: the app writes `mcp.json` (port + token, mode 0600) into its
 * config dir on launch. Override the location with INKWELL_MCP_CONFIG.
 */

import { readFile } from "node:fs/promises"
import { homedir, platform } from "node:os"
import { join } from "node:path"

const PROTOCOL_VERSION = "2024-11-05"

function configPath() {
  if (process.env.INKWELL_MCP_CONFIG) return process.env.INKWELL_MCP_CONFIG
  const id = "com.inkwell.app"
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", id, "mcp.json")
  if (platform() === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), id, "mcp.json")
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), id, "mcp.json")
}

/** Re-read per call: the app picks a new port and token every launch, so a
 *  shim that cached them would break the moment the writer restarted it. */
async function readHandshake() {
  const path = configPath()
  try {
    const { port, token } = JSON.parse(await readFile(path, "utf8"))
    if (!port || !token) throw new Error("incomplete handshake")
    return { port, token }
  } catch (err) {
    throw new Error(
      `Can't find a running Inkwell (${path}: ${err.message}). Start the desktop app and try again.`,
    )
  }
}

async function forward(method, params) {
  const { port, token } = await readHandshake()
  let response
  try {
    response = await fetch(`http://127.0.0.1:${port}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, params }),
    })
  } catch (err) {
    throw new Error(`Inkwell isn't answering on port ${port} (${err.message}). Is it still running?`)
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `Inkwell returned HTTP ${response.status}`)
  return body.result
}

// ─── Keeping the client's tool list honest ────────────────────────────────

/** How often to check whether the app's tools have changed. Cheap (one
 *  loopback call) and slow enough to be invisible; the app being closed just
 *  fails the fetch and is ignored. */
const TOOL_WATCH_MS = 15_000

let knownTools = null
let watching = false

/** Polls because there is nothing to subscribe to: the bridge answers requests
 *  and has no way to push. Rebuilding Inkwell replaces its tool set while the
 *  client holds a list it fetched once, so without this the only cure is
 *  quitting the client entirely — which is exactly the trap this hit. */
function watchForToolChanges() {
  if (watching) return
  watching = true
  const timer = setInterval(async () => {
    try {
      const result = await forward("tools/list", {})
      const names = (result?.tools ?? []).map((t) => t.name).sort().join(",")
      if (knownTools === null) {
        knownTools = names
        return
      }
      if (names !== knownTools) {
        knownTools = names
        send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" })
      }
    } catch {
      // App closed or restarting. Keep the last known set and try again.
    }
  }, TOOL_WATCH_MS)
  // Don't hold the process open on this alone.
  timer.unref?.()
}

// ─── JSON-RPC over stdio ──────────────────────────────────────────────────

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n")
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result })
}

function replyError(id, message) {
  send({ jsonrpc: "2.0", id, error: { code: -32000, message } })
}

async function handle(request) {
  const { id, method, params } = request

  // Notifications carry no id and expect no answer.
  if (id === undefined || id === null) return

  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        // listChanged: the app's tool set can change under a running client —
        // Inkwell is rebuilt far more often than a chat client is restarted,
        // and a client that cached the list at connect time would keep
        // offering yesterday's tools with no sign anything had moved.
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "inkwell", version: "0.5.0" },
      })
      watchForToolChanges()
      return
    case "ping":
      reply(id, {})
      return
    case "tools/list":
    case "tools/call":
      try {
        reply(id, await forward(method, params ?? {}))
      } catch (err) {
        // A dead app is a condition the agent should see and act on (start
        // Inkwell), not a transport error that reads like a broken shim.
        if (method === "tools/call") {
          reply(id, { content: [{ type: "text", text: err.message }], isError: true })
        } else {
          replyError(id, err.message)
        }
      }
      return
    default:
      replyError(id, `Unsupported method: ${method}`)
  }
}

// Calls are answered asynchronously, so closing stdin must not cut off work
// already in flight — exit once the last reply is out, not the moment input
// ends.
let inFlight = 0
let inputEnded = false

function exitWhenIdle() {
  if (inputEnded && inFlight === 0) process.exit(0)
}

async function track(request) {
  inFlight += 1
  try {
    await handle(request)
  } finally {
    inFlight -= 1
    exitWhenIdle()
  }
}

let buffer = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    let request
    try {
      request = JSON.parse(line)
    } catch {
      continue // Not framing we understand; the client will time out its call.
    }
    void track(request)
  }
})
process.stdin.on("end", () => {
  inputEnded = true
  exitWhenIdle()
})
