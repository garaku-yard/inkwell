# Paddle go-live runbook

Inkwell uses Paddle Billing as Merchant of Record. Complete this flow in the
Paddle sandbox before repeating it in the live account; sandbox and live IDs
are separate.

## Catalog and checkout

1. Create one recurring product for Pro and one for Business.
2. Create monthly and yearly prices for both products using the values currently
   configured in Inkwell's tier editor. Business prices must be per seat.
3. Set Paddle's default payment link to `https://<public-app-host>/checkout`.
   The live host must be approved by Paddle. The `/checkout` page loads Paddle.js
   and opens the transaction referenced by Paddle's `_ptxn` query parameter.
4. Create a Paddle API key and a client-side token for the same environment.

Configure the service environment:

```dotenv
PADDLE_API_KEY=pdl_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
PADDLE_ENVIRONMENT=sandbox
PADDLE_PRICE_MAP={"pro:monthly":"pri_...","pro:yearly":"pri_...","business:monthly":"pri_...","business:yearly":"pri_..."}
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_...
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox
```

For production, use live credentials and price IDs, set both environment values
to `production`, and rebuild the web client (`docker compose build client`)
because `NEXT_PUBLIC_*` values are
embedded at build time. Never expose `PADDLE_API_KEY` or
`PADDLE_WEBHOOK_SECRET` to the browser.

The legacy `{"pro":"pri_...","business":"pri_..."}` price map remains valid
for monthly-only installations. Annual checkout requires the cycle-specific
keys shown above.

## Webhook destination

Create a notification destination at:

```text
https://<public-gateway-host>/api/v1/billing/webhooks/paddle
```

Subscribe it to all `subscription.*` events. Copy that destination's endpoint
secret into `PADDLE_WEBHOOK_SECRET`. Keep Paddle retries enabled; Inkwell
verifies signatures, treats repeated subscription events idempotently, and
returns a server error for transient persistence failures so Paddle retries.

## Verification

1. Start the full stack and confirm the billing service logs `paddle payment gateway enabled`.
2. Buy sandbox Pro monthly, Pro yearly, and Business with at least two seats.
3. Confirm each checkout opens, then verify Settings → Billing shows the paid
   tier, renewal date, and Business seat count after its webhook arrives.
4. Change Business seats and verify the Paddle subscription quantity follows.
5. Cancel in Paddle and verify Inkwell retains access through the paid period
   and then applies the canceled state.
6. Review `/terms`, `/privacy`, and `/refund` against the live business identity,
   support address, jurisdiction, and the policies configured in Paddle before
   requesting live domain approval.
