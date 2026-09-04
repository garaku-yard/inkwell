# Inkwell

A local-first writing tool for long-form work — screenplays, novels, poetry,
comics, TTRPG content, interactive fiction, memoirs, song lyrics, and a
built-in markdown note vault. One app, one home for the draft.

Free for individuals and internal team use, source-available under
[PolyForm Shield](#license) — the only thing it rules out is reselling
Inkwell (or hosting it for others) as a competing product.

Inkwell ships as a cross-platform desktop app (Windows and Linux today;
macOS deferred). Everything lives on disk. No account required, no network
required. Hosted collaboration is an optional layer you can self-host or
skip entirely.

```
 ┌───────────────┐   ┌─────────────┐   ┌────────────┐   ┌──────────────┐
 │  Screenplay   │   │    Prose    │   │   Poetry   │   │    Comic     │
 └───────────────┘   └─────────────┘   └────────────┘   └──────────────┘
 ┌───────────────┐   ┌─────────────┐   ┌────────────┐   ┌──────────────┐
 │  Interactive  │   │    TTRPG    │   │   Memoir   │   │    Lyrics    │
 └───────────────┘   └─────────────┘   └────────────┘   └──────────────┘
                            ┌─────────────────┐
                            │  Vault (notes)  │
                            └─────────────────┘
```

---

## What's in it

- **Nine format-native editors.** Each category has its own editor tuned to
  its conventions — screenplay uses industry-standard scene/action/dialogue
  elements; prose is a manuscript editor; poetry gets line numbers and
  section labels; comic scripts follow Marvel/DC layout; interactive fiction
  ships with Twine-style `[[links]]`, a live validator, and a graph view;
  TTRPG has stat blocks and dice tables; lyrics handle chord overlays.
- **Markdown vault** _(desktop only)_ — plain `.md` files on disk,
  live-preview rendering (markdown styled inline while you type, no
  split-screen), `[[wikilinks]]` with click-to-create, backlinks panel,
  subfolder tree, and a filesystem watcher so external edits (vim, git,
  other apps) flow through. A vault is just a regular folder — rename it,
  back it up with git, point another tool at the same path. Everything
  interoperates. The hosted web build can't reach your filesystem, so vault
  projects are available in the desktop app only; the other eight editors
  work on both.
- **Beat board** — a free-form canvas of story beats with swim lanes,
  connections, and timeline placement. Works for any category, not just
  screenplay.
- **Analytics** per category — scene breakdown, dialogue balance, pacing,
  character voice, poem structure, whatever makes sense for each format.
- **AI chat side-panel** in every editor. Bring your own provider key
  for OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint
  (Ollama, LM Studio, OpenRouter, your own LiteLLM proxy). Desktop
  stores keys in your OS keychain and dispatches direct from your
  machine; the optional hosted server encrypts keys at rest with
  AES-256-GCM and decrypts only when calling the provider. The
  assistant can act on the project directly (create/read/rewrite/delete
  scenes, add beats, search vault notes) through an approval-gated tool
  registry — every destructive call is confirmed and undoable.
- **Export** — PDF for screenplay, `.md` and `.txt` for everything else,
  with per-category industry conventions baked in.
- **Collaboration** (optional) — invite by email or `@username#tag`,
  role-based access, inline comments, live presence, live co-editing with
  collaborator cursors. Requires running or self-hosting the server stack.

---

## Install

### Arch Linux

```sh
# Once published to AUR:
yay -S inkwell-bin

# For now, build locally from the repo's PKGBUILD:
git clone https://github.com/garaku-yard/inkwell.git
mkdir -p ~/build/inkwell-bin
cp inkwell/packaging/arch/PKGBUILD ~/build/inkwell-bin/
cd ~/build/inkwell-bin
updpkgsums
makepkg -si
```

### Windows / other Linux

Grab the installer for your platform from the [latest release][releases]:

- **Windows** — `Inkwell_<version>_x64-setup.exe` (NSIS installer).
  Windows SmartScreen warns on first run — click _More info → Run anyway_.
  Unsigned; a proper cert will come before a mainstream launch.
- **Linux** — `Inkwell_<version>_amd64.AppImage` or `.deb`.

[releases]: https://github.com/garaku-yard/inkwell/releases

### Build from source

```sh
git clone https://github.com/garaku-yard/inkwell.git
cd inkwell/client
npm install
npm run tauri:build      # emits the installer for the current platform
```

Artefacts land under `client/src-tauri/target/release/bundle/`.

---

## Local-first, optionally collaborative

By default Inkwell stores everything on your own machine:

- Projects + beat boards + analytics cache → SQLite at
  `~/.config/com.inkwell.app/inkwell.db` (Linux) or
  `%APPDATA%\com.inkwell.app\inkwell.db` (Windows).
- Vault notes → the `.md` files in the folder you picked.
- AI provider keys → your OS keychain, never transmitted by Inkwell.

If you want real-time collaboration, cross-device sync, or sharing, spin up
the server stack — everything's in this repo. Details in
[CONTRIBUTING.md](./CONTRIBUTING.md#running-the-server-stack). Self-host it
freely for yourself, your team, or your org; reselling Inkwell hosting to
others is the one thing the license reserves (see [License](#license)).

---

## Architecture

Inkwell is built in two halves that can be run independently:

```
┌─────────────────────────┐          ┌────────────────────────────┐
│      Desktop app        │          │  Optional hosted stack     │
│   (Tauri + Next.js)     │          │   (self-host or ignore)    │
│                         │          │                            │
│  CodeMirror 6 editors   │          │  api-gateway (HTTP :8080)  │
│  SQLite + .md files     │  ⇄ HTTP  │     ├─ identity-service    │
│  Local-first storage    │  cookie  │     ├─ scripts-service     │
│  Local AI provider      │   auth   │     ├─ collab-service      │
│                         │          │     ├─ billing-service     │
│                         │          │     ├─ workspace-service   │
└─────────────────────────┘          │     └─ aisettings-service  │
                                     │                            │
                                     │  Postgres / Redis / Kafka  │
                                     └────────────────────────────┘
```

**Client:** Next.js 15, React 19, TypeScript, Tailwind v4 + shadcn/ui,
CodeMirror 6 for live-preview markdown. Bundled with Tauri v2 for the
desktop build.

**Server:** Go microservices over gRPC behind a chi HTTP gateway.
PostgreSQL per service, Redis for JWT blocklist + rate-limiting, Kafka for
async domain events with a transactional outbox.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the service tour, boundaries,
and how to add a new service.

---

## Develop

```sh
# Desktop dev loop — fastest
cd client && npm install
npm run tauri:dev          # Next dev + Tauri window, no servers needed

# Full web stack (optional)
cp .env.example .env
task setup                 # dev tool deps
task fresh                 # docker build + migrations + up
```

The web client ends up at `http://localhost:3000`, the gateway at `:8080`.
See the [Taskfile][taskfile] for the other targets.

[taskfile]: ./Taskfile.yml

---

## Repository layout

```
client/
  app/                    Next.js routes ((private) / (public))
  components/             editors, beat board, settings, UI kit
  lib/storage/            Storage abstraction (local SQLite + remote HTTP)
  src-tauri/              Rust shell, migrations, capabilities, icons
server/
  cmd/                    one main.go per service
  internal/               service layers (domain/repo/service/handler)
  pkg/                    shared Go packages (events, outbox, redis, quota…)
  proto/                  gRPC contracts — source of truth
packaging/arch/           AUR PKGBUILD for `inkwell-bin`
.github/workflows/        CI + release pipelines
```

---

## Status

Inkwell is pre-1.0. The desktop build is the primary surface and is
considered usable day-to-day; the hosted stack is functional but still
tightening up around identity + billing polish. See [PLANNING.md][plan]
for the active tracker.

[plan]: ./PLANNING.md

---

## Contributing

Issues and pull requests welcome. Before opening a PR, skim
[CONTRIBUTING.md](./CONTRIBUTING.md) for the service boundaries and
conventions. For release operations see [RELEASING.md](./RELEASING.md).

Brand voice, palette, and logo rules live in [BRANDBOOK.md](./BRANDBOOK.md).

---

## License

[PolyForm Shield 1.0.0](./LICENSE) © Inkwell contributors.

Free to use, study, modify, and share for any purpose — personal projects,
freelance/commercial writing, and internal use at a company or org all
qualify, no revenue or seat limits. The one thing it rules out is
**competing use**: offering Inkwell, or a hosted/managed service built on
it, to other people as a substitute for Inkwell itself or for the hosting
plans, workspaces, and org/admin features we sell. Source-available, not
OSI open source — this restriction is exactly what that label would
prohibit.

Full terms at
[polyformproject.org/licenses/shield/1.0.0](https://polyformproject.org/licenses/shield/1.0.0).
