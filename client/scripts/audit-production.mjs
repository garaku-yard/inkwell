import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const exception = JSON.parse(readFileSync(new URL("../security-audit-exceptions.json", import.meta.url)))
const expires = new Date(`${exception.expires}T00:00:00Z`)
if (!Number.isFinite(expires.valueOf()) || expires < new Date()) {
  throw new Error(`production audit exception expired on ${exception.expires}`)
}

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
const allowedPackages = [...exception.packages].sort()
if (JSON.stringify(foundPackages) !== JSON.stringify(allowedPackages)) {
  throw new Error(`unexpected vulnerable packages: ${foundPackages.join(", ") || "none"}`)
}

const foundAdvisories = new Set()
for (const vulnerability of Object.values(vulnerabilities)) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "object" && via.source) foundAdvisories.add(Number(via.source))
  }
}
const allowedAdvisories = new Set(exception.advisories.map(Number))
for (const advisory of foundAdvisories) {
  if (!allowedAdvisories.has(advisory)) throw new Error(`unapproved npm advisory: ${advisory}`)
}
for (const advisory of allowedAdvisories) {
  if (!foundAdvisories.has(advisory)) throw new Error(`stale npm advisory exception: ${advisory}`)
}

console.log(
  `Production audit contains only the reviewed browser-packaging exception (${foundPackages.join(", ")}); expires ${exception.expires}.`,
)
