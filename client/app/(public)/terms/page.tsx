import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Terms of Service — Inkwell" }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="18 June 2026">
      <p>
        Inkwell is open-source software provided under the{" "}
        <a href="https://github.com/garaku-yard/inkwell/blob/main/LICENSE">
          PolyForm Noncommercial License 1.0.0
        </a>
        . By using Inkwell you agree to the terms below.
      </p>

      <h2>Use of the software</h2>
      <p>
        Non-commercial use is free. Commercial use — including hosting Inkwell
        as a paid service — requires a separate agreement; see the license for
        the precise definition of permitted use.
      </p>

      <h2>Your content</h2>
      <p>
        You own everything you write. Inkwell does not claim any rights over
        your projects. On the desktop app your work lives on your own machine;
        on a hosted instance it lives on whichever server you connect to,
        operated by you or the party who runs that instance.
      </p>

      <h2>Third-party AI providers</h2>
      <p>
        Inkwell uses a bring-your-own-key model for AI features. When you send a
        message to a provider (OpenAI, Anthropic, Gemini, or a self-hosted
        endpoint), that request and its content are handled under{" "}
        <strong>that provider&apos;s</strong> terms, not Inkwell&apos;s. You are
        responsible for the keys you configure and the costs they incur.
      </p>

      <h2>No warranty</h2>
      <p>
        Inkwell is provided &quot;as is&quot;, without warranty of any kind. To
        the extent permitted by law, the authors are not liable for any loss or
        damage arising from its use. Keep your own backups of important work.
      </p>
    </LegalPage>
  )
}
