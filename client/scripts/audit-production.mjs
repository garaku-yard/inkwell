import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const transformers = JSON.parse(
  readFileSync(new URL("../node_modules/@huggingface/transformers/package.json", import.meta.url)),
)
if (transformers.exports?.default?.default !== "./dist/transformers.web.js") {
  throw new Error("Transformers no longer selects its audited browser/WASM export by default")
}

const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
})
if (!audit.stdout) throw new Error(audit.stderr || "npm audit returned no report")
const report = JSON.parse(audit.stdout)
const vulnerabilities = report.vulnerabilities ?? {}
const foundPackages = Object.keys(vulnerabilities).sort()
if (report.error || audit.error || (audit.status !== 0 && foundPackages.length === 0)) {
  throw new Error(report.error?.message || audit.error?.message || `npm audit exited with status ${audit.status}`)
}
if (foundPackages.length > 0) {
  throw new Error(`production npm audit found vulnerable packages: ${foundPackages.join(", ")}`)
}

console.log("Production npm audit is clean; Transformers still selects its browser/WASM export.")
