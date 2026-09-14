# Transactional outbox operations

Deploy the outbox migrations before the service binaries. The poller requires
the `claimed_at`, `claimed_by`, `attempts`, `last_error`, and
`dead_lettered_at` columns added by the hardening migration in each service.
Topics and payloads remain unchanged. Kafka envelopes now use the outbox UUID
as both `id` and message key, including retries.

Pollers lease rows for one minute using `FOR UPDATE SKIP LOCKED`, commit the
claim, and publish outside the database transaction. A process that stops after
publishing but before marking the row will publish it again after lease expiry
with the same event ID. Consumers must therefore remain idempotent.

A failed publish records `last_error`, releases the claim, and increments the
attempt count assigned during claiming. After ten attempts the row receives a
`dead_lettered_at` timestamp. It remains in its service outbox table for
inspection and is excluded from automatic claims, so one poison event cannot
block later events.

Poller logs contain `event_id`, `event_type`, `attempt`, `age`, `claimed_by`,
and `result`. Inspect poison rows with:

```sql
SELECT id, event_type, attempts, last_error, created_at, dead_lettered_at
FROM <service>_outbox
WHERE dead_lettered_at IS NOT NULL
ORDER BY dead_lettered_at;
```

After correcting the payload or publisher failure, requeue a row explicitly:

```sql
UPDATE <service>_outbox
SET attempts = 0, last_error = NULL, dead_lettered_at = NULL,
    claimed_at = NULL, claimed_by = NULL
WHERE id = '<event-id>' AND published_at IS NULL;
```

Run unit and PostgreSQL concurrency checks with:

```sh
go test -race ./pkg/outbox ./pkg/events ./internal/notifications/...
OUTBOX_TEST_DATABASE_URL='postgres://...' task test:outbox:db
```
