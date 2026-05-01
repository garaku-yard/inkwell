# ai-service — legacy

This Python microservice was Inkwell's AI chat dispatcher before the
server-side BYO path landed. It still handles the legacy code path in the
gateway (`AIHandler.chatProxy` — requests that arrive at `/api/ai/chat`
without a `providerId`), so it keeps running in docker-compose, but it
shouldn't grow new features.

## Where AI logic lives today

- **BYO hosted providers (OpenAI / Anthropic / Gemini) on the web build** —
  `server/pkg/aiadapter/` in Go, wired through
  `server/internal/gateway/handlers/ai.go`'s BYO branch.
- **BYO providers on the desktop build** — `client/lib/ai/providers/` in
  TypeScript, dispatched directly from Tauri with keys pulled out of the
  OS keychain.
- **Local models (Ollama / LM Studio / OpenAI-compatible)** — the same
  TypeScript adapter library runs in the browser and calls the user's
  own endpoint directly.

## When to remove this service

When the fallback code path in `AIHandler.chatProxy` is deleted (i.e.
when every supported client is on a version that always sends
`providerId`), this service, its Dockerfile, and both `ai-service` +
`AI_CHAT_SERVICE_*` entries in `docker-compose.yml` / `.env.example` can
all go.
