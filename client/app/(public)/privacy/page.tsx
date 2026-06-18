import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Privacy — Inkwell" }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="18 June 2026">
      <p>
        Inkwell is local-first. The short version: your writing stays where you
        put it, and Inkwell does not run any third-party tracking or analytics.
      </p>

      <h2>Desktop app</h2>
      <p>
        On the desktop build your projects, notes, and vault files are stored on
        your own machine — in a local SQLite database and, for vault notes, as
        plain <code>.md</code> files in a folder you choose. No account is
        required and nothing is sent to a server unless you explicitly connect
        to a hosted instance.
      </p>

      <h2>Hosted instances</h2>
      <p>
        If you sign in to a hosted Inkwell instance, your account and projects
        are stored on that server, operated by whoever runs it. Authentication
        uses an httpOnly session cookie. What that operator can see is governed
        by their own policies.
      </p>

      <h2>AI provider keys</h2>
      <p>
        AI features use your own provider keys. On the desktop app, keys are
        stored in your operating system&apos;s keychain and chat requests go
        directly from your machine to the provider you chose. On a hosted
        instance, keys are encrypted at rest (AES-256-GCM) and only decrypted
        server-side at the moment a request is dispatched. Inkwell never sends
        your keys anywhere except the provider you configured.
      </p>

      <h2>What we don&apos;t do</h2>
      <p>
        No advertising, no selling of data, and no third-party analytics or
        tracking scripts in the app.
      </p>
    </LegalPage>
  )
}
