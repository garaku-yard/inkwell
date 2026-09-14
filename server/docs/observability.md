# Request and event correlation

HTTP responses expose `X-Correlation-ID`. The gateway stores that value in the
request context, sends it as `x-correlation-id` gRPC metadata, and every service
attaches it to the downstream context. A service receiving a call without the
metadata generates a safe UUID, so internal callers still produce traceable
logs.

Authenticated calls also carry the opaque user UUID as `x-actor-id`. This is
used only for the `actor_id` log field and is forwarded by nested calls; names,
emails, tokens, and authorization headers are never placed in this metadata.

Synchronous RPC logs use `correlation_id`, `service`, `rpc`, `duration_ms`,
`outcome`, and canonical gRPC `code`. Gateway HTTP logs also include `method`,
`path`, status, and client IP. Downstream client logs provide per-service call
latency and error outcomes; a metrics backend can later derive counters from
the same fields.

Event envelopes and publisher/consumer logs include stable `event_id` plus
`correlation_id` and optional `causation_id`. The transactional outbox persists
the originating correlation ID so delayed retries retain it.

To follow a request, copy the response correlation header and search structured
logs across services:

```sh
docker compose logs gateway scripts billing | rg 'correlation_id.*<id>'
```

Logs must not include authorization metadata, JWTs, refresh tokens, provider
keys, raw protobuf requests, document content, or sensitive request bodies.
