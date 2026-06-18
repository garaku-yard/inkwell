import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Licenses — Inkwell" }

export default function LicensesPage() {
  return (
    <LegalPage title="Licenses" updated="18 June 2026">
      <h2>Inkwell</h2>
      <p>
        Inkwell is released under the{" "}
        <a href="https://github.com/garaku-yard/inkwell/blob/main/LICENSE">
          PolyForm Noncommercial License 1.0.0
        </a>
        . Non-commercial use is free; commercial hosting requires a separate
        agreement. The full source is available on{" "}
        <a href="https://github.com/garaku-yard/inkwell">GitHub</a>.
      </p>

      <h2>Open-source dependencies</h2>
      <p>
        Inkwell is built on open-source software, including Next.js, React,
        Tailwind CSS, CodeMirror, Tauri, and the Go standard library and
        ecosystem. Each dependency remains under its own license; the complete
        list with versions lives in the{" "}
        <a href="https://github.com/garaku-yard/inkwell">project repository</a>{" "}
        (<code>package.json</code> / <code>go.mod</code> /{" "}
        <code>Cargo.toml</code>).
      </p>

      <p>
        We&apos;re grateful to the maintainers of these projects — Inkwell would
        not exist without them.
      </p>
    </LegalPage>
  )
}
