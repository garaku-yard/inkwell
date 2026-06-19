import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Privacy — Inkwell" }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="19 June 2026">
      <p>
        Inkwell is local-first. The short version: your writing stays where you
        put it, and Inkwell does not run any third-party tracking or analytics.
        This policy explains what the hosted service stores when you choose to
        use it.
      </p>

      <h2>Desktop app</h2>
      <p>
        On the desktop build your projects, notes, and vault files are stored on
        your own machine — in a local SQLite database and, for vault notes, as
        plain <code>.md</code> files in a folder you choose. No account is
        required and nothing is sent to a server unless you explicitly connect
        to the hosted service.
      </p>

      <h2>The hosted service</h2>
      <p>
        If you create an account on the hosted service, we store the data needed
        to run it: your email address, username, and any profile details you
        add; the projects, notes, and comments you create or that are shared
        with you; and your workspace and collaboration relationships.
        Authentication uses an httpOnly session cookie. We use this data only to
        operate the service for you — to sync your work, enable collaboration,
        and send the account and notification emails you have opted into.
      </p>

      <h2>Payments</h2>
      <p>
        Paid subscriptions are processed by our Merchant of Record,{" "}
        <a href="https://www.paddle.com">Paddle.com</a>. Paddle collects and
        processes your payment details directly;{" "}
        <strong>Inkwell never receives or stores your card or bank details</strong>
        . We store only what we need to apply your plan: your subscription
        status, tier, seat count, and renewal date, plus the Paddle subscription
        and customer identifiers that link your account to your Paddle
        subscription. Paddle&apos;s handling of your payment data is governed by
        the{" "}
        <a href="https://www.paddle.com/legal/privacy">Paddle Privacy Policy</a>.
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

      <h2>Email</h2>
      <p>
        When email notifications are enabled, the hosted service sends mail
        (welcome, collaboration invites, and notifications you opt into) through
        an SMTP provider. You can turn notification emails off in Settings.
      </p>

      <h2>Keeping and deleting your data</h2>
      <p>
        We keep your account data for as long as your account exists. You can
        delete your account at any time from Settings → Data Controls, which
        removes your account and associated data; you can also submit a data
        deletion request there. Billing records held by Paddle are retained by
        Paddle as required for tax and accounting.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, or
        delete the personal data we hold about you, or to object to its
        processing. To exercise them, use the controls in Settings or email{" "}
        <a href="mailto:support@inkwell.app">support@inkwell.app</a>.
      </p>

      <h2>What we don&apos;t do</h2>
      <p>
        No advertising, no selling of data, and no third-party analytics or
        tracking scripts in the app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy, or to reach the data controller for the hosted
        service, email <a href="mailto:support@inkwell.app">support@inkwell.app</a>.
      </p>
    </LegalPage>
  )
}
