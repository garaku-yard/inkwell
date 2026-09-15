# Managed AI operations

Managed AI lets hosted users chat through an API key owned by the Inkwell
operator. It is optional: with no `AI_MANAGED_*_KEY` values, the gateway lists
no managed providers and bring-your-own-key AI continues to work normally.

## Recommended first provider

Enable one provider first. This limits both cost exposure and the number of
external systems involved while the production path is being verified. The
gateway currently supports:

| Provider | Key variable | Default model |
| --- | --- | --- |
| OpenAI | `AI_MANAGED_OPENAI_KEY` | `gpt-4o-mini` |
| Anthropic | `AI_MANAGED_ANTHROPIC_KEY` | `claude-haiku-4-5` |
| Gemini | `AI_MANAGED_GEMINI_KEY` | `gemini-3.5-flash-lite` |

Each model can be overridden with the matching `AI_MANAGED_*_MODEL` variable.
Use an exact model identifier supported by the provider account. Model
availability and retirement dates change, so verify the identifier in the
provider's official model documentation when enabling or rotating it.

## Before adding a key

1. Create a dedicated project or workspace in the provider account for
   Inkwell, rather than reusing a personal development project.
2. Add a conservative provider-side monthly budget and usage alerts. Inkwell's
   tier quota reduces exposure but is not a substitute for a provider hard cap.
3. Create a restricted production key where the provider supports key scopes.
4. Store it in the deployment's secret manager or root `.env`; never put it in
   source control, a `NEXT_PUBLIC_*` variable, an image, or a support message.
5. Record who owns key rotation and billing alerts.

## Enable and verify

Set only the provider being tested, then recreate the gateway so it receives
the new environment:

```sh
docker compose up -d --force-recreate api-gateway
```

Verify in this order:

1. Sign in to the hosted app and open **Settings → AI Providers**. The selected
   provider should appear as `<Provider> (Managed)`; providers without keys
   must remain absent.
2. Send one short prompt in a disposable project. Confirm text streams and the
   configured model accepts the tool schema.
3. Open **Settings → Billing** and confirm managed token usage increased.
4. Check gateway logs for dispatch or metering errors. Provider response bodies
   are redacted before reaching users, and keys must never appear in logs.
5. Test an account whose managed allowance is exhausted. It should receive the
   allowance message and may still use its own provider key.

## Disable or rotate

To stop new managed traffic immediately, remove the provider key and recreate
`api-gateway`. The provider disappears from subsequent client refreshes; BYO AI
is unaffected.

For rotation, create the replacement key first, replace the secret, recreate
the gateway, run the short smoke test, and only then revoke the old key. No
database migration is needed because managed keys are read from process
environment and are never persisted by Inkwell.

## Incident response

If a key may have leaked, revoke it at the provider before investigating. Then
remove it from the deployment, recreate the gateway, inspect provider usage and
gateway logs, and issue a new key only after the exposure path is closed. Never
paste the compromised key into an issue or log query.
