/** Guards the Tauri fs capability contract.
 *
 *  Every `@tauri-apps/plugin-fs` API the frontend calls needs a matching
 *  `fs:allow-<command>` permission in the Tauri capability manifest, or the
 *  command is denied at runtime. That failure is invisible from TypeScript:
 *  nothing here is type-checked against the manifest, so a new fs call compiles,
 *  lints, passes tests, and then throws only on a real desktop build.
 *
 *  This is not hypothetical. `stat`, `readFile` and `writeFile` were used by the
 *  vault sync engine from its first commit with no permission granted, and
 *  because the call sites swallowed the error, vault sync silently pushed
 *  nothing while reporting "Synced". This test is the cheap check that would
 *  have caught it the day it was written.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const CLIENT_ROOT = join(__dirname, "..", "..")
const CAPABILITIES = join(CLIENT_ROOT, "src-tauri", "capabilities", "default.json")

/** Frontend fs API → the permission that command requires. Extend when the
 *  engine starts using a new one. */
const API_TO_PERMISSION: Record<string, string> = {
  readTextFile: "fs:allow-read-text-file",
  writeTextFile: "fs:allow-write-text-file",
  readFile: "fs:allow-read-file",
  writeFile: "fs:allow-write-file",
  readDir: "fs:allow-read-dir",
  stat: "fs:allow-stat",
  lstat: "fs:allow-lstat",
  exists: "fs:allow-exists",
  mkdir: "fs:allow-mkdir",
  remove: "fs:allow-remove",
  rename: "fs:allow-rename",
  copyFile: "fs:allow-copy-file",
  watch: "fs:allow-watch",
  watchImmediate: "fs:allow-watch",
  unwatch: "fs:allow-unwatch",
}

/** Source files that import from the fs plugin, and what each pulls in.
 *  Listed explicitly rather than globbed so a new call site is a deliberate
 *  edit here (and this test stays readable when it fails). */
const CALL_SITES = [
  "lib/storage/local/vault-sync.ts",
  "lib/storage/local/vault.ts",
  "components/editor/VaultEditor.tsx",
  "components/editor/vault/useVaultWatcher.ts",
  "app/(private)/dashboard/fdx-import-dialog.tsx",
]

/** Pull the named imports out of every `from "@tauri-apps/plugin-fs"` statement. */
function fsImportsOf(relPath: string): string[] {
  let src: string
  try {
    src = readFileSync(join(CLIENT_ROOT, relPath), "utf8")
  } catch {
    return [] // file moved/removed — the sweep below still covers the rest
  }
  const names: string[] = []
  const re = /import\s*\{([^}]*)\}\s*from\s*["']@tauri-apps\/plugin-fs["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim()
      if (name) names.push(name)
    }
  }
  return names
}

describe("tauri fs capabilities", () => {
  const manifest = JSON.parse(readFileSync(CAPABILITIES, "utf8")) as { permissions: unknown[] }
  const granted = new Set(manifest.permissions.filter((p): p is string => typeof p === "string"))

  it("grants every fs command the frontend imports", () => {
    const missing: string[] = []
    for (const file of CALL_SITES) {
      for (const api of fsImportsOf(file)) {
        const perm = API_TO_PERMISSION[api]
        // An unmapped name means the map above is stale — fail loudly rather
        // than quietly treat an unknown fs call as fine.
        expect(perm, `no permission mapping known for fs API "${api}" (used in ${file})`).toBeTruthy()
        if (!granted.has(perm)) missing.push(`${api} (${file}) needs ${perm}`)
      }
    }
    expect(missing, `fs commands used without a capability:\n  ${missing.join("\n  ")}`).toEqual([])
  })

  it("still grants the ones vault sync depends on", () => {
    // The exact three that were missing, pinned so a cleanup can't drop them.
    for (const perm of ["fs:allow-stat", "fs:allow-read-file", "fs:allow-write-file"]) {
      expect(granted.has(perm), `${perm} missing — vault sync silently syncs nothing without it`).toBe(true)
    }
  })
})
