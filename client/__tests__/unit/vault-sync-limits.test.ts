/** Keeps the vault client's size budgets under the transport's real ceiling.
 *
 *  These live in two languages and two Docker build contexts, so neither can
 *  import the other — exactly the setup that let them disagree. And they did:
 *  the client budgeted pushes at 12 MiB and its comment asserted a "32 MiB
 *  server-side" cap, while the server configured nothing at all and so enforced
 *  grpc-go's 4 MiB default. Any vault with more than 4 MiB of changed files
 *  failed permanently, and because the client rebuilds the same batch each
 *  attempt, every retry failed identically (Orbit #151).
 *
 *  Nothing catches that at compile time and no unit test on either side alone
 *  would have caught it either, because each side was internally consistent.
 *  This test is the join.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const CLIENT_ROOT = join(__dirname, "..", "..")
const REPO_ROOT = join(CLIENT_ROOT, "..")

const LIMITS_GO = join(REPO_ROOT, "server", "pkg", "grpclimits", "limits.go")
const VAULT_SYNC_TS = join(CLIENT_ROOT, "lib", "storage", "local", "vault-sync.ts")
const SYNC_HANDLER_GO = join(
  REPO_ROOT, "server", "internal", "scripts", "handler", "sync_handler.go",
)

/** Reads `const <name> = <n> << <shift>` from Go source. */
function goShiftConst(file: string, name: string): number {
  const src = readFileSync(file, "utf8")
  const m = new RegExp(`${name}\\s*=\\s*(\\d+)\\s*<<\\s*(\\d+)`).exec(src)
  if (!m) throw new Error(`${name} not found in ${file} — did it get renamed?`)
  return Number(m[1]) * 2 ** Number(m[2])
}

/** Reads `const <NAME> = <a> * <b> * <c>` from the TS tuning block. */
function tsProductConst(name: string): number {
  const src = readFileSync(VAULT_SYNC_TS, "utf8")
  const m = new RegExp(`${name}\\s*=\\s*([0-9 *]+)`).exec(src)
  if (!m) throw new Error(`${name} not found in vault-sync.ts — did it get renamed?`)
  return m[1].split("*").reduce((acc, part) => acc * Number(part.trim()), 1)
}

const ceiling = () => goShiftConst(LIMITS_GO, "MaxMessageBytes")

describe("vault sync size budgets vs the gRPC ceiling", () => {
  it("the ceiling is actually configured, not left at grpc-go's default", () => {
    // The bug was the absence of any setting. 4 MiB here means it regressed.
    expect(ceiling()).toBeGreaterThan(4 * 1024 * 1024)
  })

  it("a single maximum-size file fits in one message", () => {
    // Batching always emits at least one file, so a lone MAX_PUSH_FILE_BYTES
    // file must fit by itself — no batch budget can rescue it.
    expect(tsProductConst("MAX_PUSH_FILE_BYTES")).toBeLessThan(ceiling())
  })

  it("a full push batch fits in one message", () => {
    expect(tsProductConst("PUSH_BATCH_MAX_BYTES")).toBeLessThan(ceiling())
  })

  it("a full pull page fits in one message", () => {
    // The other direction, rejected by the gateway's client rather than the
    // service — same default, same permanent failure.
    expect(goShiftConst(SYNC_HANDLER_GO, "vaultPageMaxBytes")).toBeLessThan(ceiling())
  })

  it("both gRPC servers and clients are given the limit", () => {
    // Setting only one side leaves the other on the 4 MiB default, which is
    // how a push could succeed while the pull it triggers fails.
    const src = readFileSync(LIMITS_GO, "utf8")
    expect(src).toMatch(/grpc\.MaxRecvMsgSize/)
    expect(src).toMatch(/grpc\.MaxSendMsgSize/)
    expect(src).toMatch(/grpc\.MaxCallRecvMsgSize/)
    expect(src).toMatch(/grpc\.MaxCallSendMsgSize/)
  })
})
