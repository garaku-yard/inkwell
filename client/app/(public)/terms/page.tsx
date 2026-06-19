import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Terms of Service — Inkwell" }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="19 June 2026">
      <p>
        Inkwell (&quot;Inkwell&quot;, &quot;we&quot;, &quot;us&quot;) is a
        writing platform offered both as free, open-source software you run
        yourself and as an optional paid hosted service. By using Inkwell or
        subscribing to a paid plan you agree to these terms.
      </p>

      <h2>The software</h2>
      <p>
        The Inkwell application is open-source, provided under the{" "}
        <a href="https://github.com/garaku-yard/inkwell/blob/main/LICENSE">
          PolyForm Noncommercial License 1.0.0
        </a>
        . Non-commercial use is free. Commercial use — including hosting Inkwell
        as a paid service — requires a separate agreement; see the license for
        the precise definition of permitted use.
      </p>

      <h2>Your content</h2>
      <p>
        You own everything you write. Inkwell does not claim any rights over
        your projects. On the desktop app your work lives on your own machine;
        on the hosted service it is stored so we can sync it across your devices
        and share it with collaborators you invite. You are responsible for the
        content you create and share.
      </p>

      <h2>Accounts</h2>
      <p>
        The hosted service requires an account. You are responsible for keeping
        your credentials secure and for activity under your account. You can
        delete your account and request deletion of your data at any time from
        Settings — see our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Subscriptions and billing</h2>
      <p>
        The hosted service offers a free tier and paid plans (currently Pro,
        billed per user, and Business, billed per seat). Paid plans unlock cloud
        sync, real-time collaboration, and business workspaces.
      </p>
      <p>
        Payments are processed by our reseller and Merchant of Record,{" "}
        <a href="https://www.paddle.com">Paddle.com</a>. When you buy a
        subscription, Paddle (not Inkwell) is the seller of record: Paddle
        handles the transaction, issues your invoice, and collects any
        applicable sales tax or VAT. Your purchase is also subject to{" "}
        <a href="https://www.paddle.com/legal/checkout-buyer-terms">
          Paddle&apos;s Buyer Terms
        </a>
        .
      </p>
      <p>
        Subscriptions renew automatically each billing period until cancelled.
        You can cancel at any time from Settings → Billing; your plan stays
        active until the end of the period you have already paid for, after
        which your account reverts to the free tier. Prices are shown before you
        check out and may change with notice for future billing periods.
      </p>

      <h2>Cancellation and refunds</h2>
      <p>
        You may cancel a subscription at any time. Refunds are handled as
        described in our <a href="/refund">Refund Policy</a>.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use the hosted service to store or share unlawful content, to
        infringe others&apos; rights, or to attempt to disrupt, overload, or
        gain unauthorised access to the service or other users&apos; data. We
        may suspend accounts that do.
      </p>

      <h2>Third-party AI providers</h2>
      <p>
        Inkwell uses a bring-your-own-key model for AI features. When you send a
        message to a provider (OpenAI, Anthropic, Gemini, or a self-hosted
        endpoint), that request and its content are handled under{" "}
        <strong>that provider&apos;s</strong> terms, not Inkwell&apos;s. You are
        responsible for the keys you configure and the costs they incur.
      </p>

      <h2>No warranty and liability</h2>
      <p>
        The service is provided &quot;as is&quot;, without warranty of any kind.
        To the extent permitted by law, we are not liable for any indirect or
        consequential loss, or for loss of data, arising from use of the
        software or service. Keep your own backups of important work. Nothing in
        these terms limits rights you have under mandatory consumer law.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of Kosovo, without
        regard to conflict-of-law rules, except where mandatory consumer
        protection law in your country of residence applies.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. Material changes will be
        reflected in the &quot;last updated&quot; date above, and continued use
        of the service after a change means you accept the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email{" "}
        <a href="mailto:support@inkwell.app">support@inkwell.app</a>.
      </p>
    </LegalPage>
  )
}
