import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = { title: "Refund Policy — Inkwell" }

export default function RefundPage() {
  return (
    <LegalPage title="Refund Policy" updated="14 September 2026">
      <p>
        This policy applies to paid subscriptions to the Inkwell hosted service.
        Payments are handled by our Merchant of Record,{" "}
        <a href="https://www.paddle.com">Paddle.com</a>, who processes refunds on
        our behalf.
      </p>

      <h2>Cancelling</h2>
      <p>
        You can cancel a subscription at any time from Settings → Billing.
        Cancelling stops future renewals; your plan stays active until the end
        of the billing period you have already paid for, after which your
        account reverts to the free tier. The desktop app and your local work
        are unaffected — they keep working for free.
      </p>

      <h2>Refunds</h2>
      <p>
        If you are not satisfied, you may request a refund within{" "}
        <strong>14 days</strong> of a charge. We are glad to refund the most
        recent payment within this window, no questions asked. After 14 days,
        payments for the current period are generally non-refundable, but if
        something has gone wrong on our side — a billing error, a duplicate
        charge, or an outage that prevented you from using the service — contact
        us and we will make it right.
      </p>
      <p>
        Refunds are issued to your original payment method by Paddle. Nothing in
        this policy limits any statutory refund or cancellation rights you have
        under the consumer law of your country.
      </p>

      <h2>Per-seat (Business) plans</h2>
      <p>
        Business plans are billed by seat. Reducing your seat count takes effect
        from the next billing period; we do not pro-rate refunds for seats
        removed mid-period. Adding seats is charged on a pro-rated basis for the
        remainder of the current period.
      </p>

      <h2>How to request a refund</h2>
      <p>
        Email <a href="mailto:support@inkwell.app">support@inkwell.app</a> from
        the address on your account, or use the contact details on the Paddle
        receipt you received by email. Please include your order or invoice
        reference so we can find your payment quickly.
      </p>
    </LegalPage>
  )
}
