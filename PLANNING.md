# Inkwell — Feature Status & Fix Plan

Legend: ✅ Working · ⚠️ Partial / buggy · ❌ Broken · 🔲 UI only (no backend) · 🚧 Not built

---

## Auth & Onboarding

| Feature | Status | Notes |
|---|---|---|
| Login / register | ✅ | |
| JWT auth + refresh | ✅ | |
| Onboarding flow | ✅ | Moved to `(private)` route group |
| `?next=` redirect after login | ✅ | |

---

## Workspace System

| Feature | Status | Notes |
|---|---|---|
| Workspace sidebar (always visible) | ✅ | Slack-style icon rail |
| Category icons (SVGs) | ✅ | Minimalist stroke icons per category |
| Active workspace highlight (category color) | ✅ | |
| Add personal workspace dialog | ✅ | Multi-select category picker |
| Create org workspace dialog | ⚠️ | Frontend exists, backend likely works — untested end-to-end |
| Projects scoped to workspace | ✅ | Filtered by workspace category slugs |

---

## Dashboard

| Feature | Status | Notes |
|---|---|---|
| Project list | ✅ | |
| Search | ✅ | |
| Sort by last updated | ✅ | |
| My Projects filter | ✅ | |
| Collaborations filter | ✅ | |
| Starred filter | ✅ | Fixed (was returning `[]`) |
| Star / unstar project | ✅ | |
| Create new project | ✅ | Category set from active workspace |
| Delete project | ✅ | |
| Rename project | ✅ | |
| Empty state copy | ✅ | Shows workspace name |
| Pending invite count badge | ✅ | Fixed (collab invitations table name) |
| Analytics link from project | ⚠️ | Routes exist, all data is hardcoded static |

---

## Editors — Routing & Infrastructure

| Feature | Status | Notes |
|---|---|---|
| `EditorFactory` routing by category | ✅ | |
| `getFullProject` loads scenes + elements | ✅ | |
| Debounced auto-save | ✅ | 1500ms, all editors |
| Save status indicator | ✅ | Saved / Saving… / Unsaved |
| Back to dashboard button | ✅ | All editors |

---

## Screenplay Editor

| Feature | Status | Notes |
|---|---|---|
| Scene creation + editing | ✅ | |
| Element types (action, dialogue, etc.) | ✅ | |
| Scene heading autocomplete | ✅ | |
| Character name autocomplete | ✅ | |
| Element type transform (toolbar) | ✅ | |
| Keyboard shortcuts (Tab to transform, Enter to next) | ✅ | |
| Page pagination (US Letter layout) | ✅ | |
| Comments panel | ⚠️ | UI exists, save/load works but `collaboration_invitations` error fixed — needs retest |
| Import script dialog | ⚠️ | UI exists, import logic unknown |
| AI Chat panel | ❌ | `ai-service` is unhealthy — starts but no API key configured, requests fail |
| Beat board link | ⚠️ | Links to `/projects/[id]/beat-board` — see below |
| Outline editor link | ⚠️ | Links to `/projects/[id]/outline-editor` — see below |
| Analytics link | ⚠️ | Links to `/analytics` — see below |
| Export to PDF/FDX | 🔲 | Button exists, no implementation |

---

## Prose Editor (Novel / Memoir)

| Feature | Status | Notes |
|---|---|---|
| Chapter sidebar | ✅ | |
| Add chapter | ✅ | |
| Paragraph / heading / scene break elements | ✅ | |
| Word count | ✅ | Counts from loaded elements only |
| Enter to add new paragraph | ✅ | |
| Insert toolbar | ✅ | |
| Element persistence on reload | ✅ | `getFullProject` fetches scene elements |

---

## Poetry / Lyrics Editor

| Feature | Status | Notes |
|---|---|---|
| Poem / song list sidebar | ✅ | |
| Add poem / song | ✅ | |
| Line editing | ✅ | |
| Center / left align toggle | ✅ | |
| Line count | ✅ | |
| Enter → new line | ✅ | |
| Shift+Enter → stanza break | ✅ | Fixed |
| "Stanza break" toolbar button | ✅ | Fixed (was creating a `line`) |
| Lyrics section labels (Verse, Chorus…) | ⚠️ | Creates label in DB but doesn't add to local state until refresh |
| Section label shows above lines | ✅ | On reload |

**Fix needed:** `handleAddSection(label)` creates the `section_label` element in the DB but only pushes the `line` element to local state. Should push both.

---

## Comic Script Editor

| Feature | Status | Notes |
|---|---|---|
| Page list sidebar | ✅ | |
| Add page | ✅ | |
| Panel / caption / character / balloon / SFX / transition | ✅ | |
| Distinct styling per element type | ✅ | |
| Panel count | ✅ | |
| Smart Enter key (panel→caption, etc.) | ✅ | |
| Element toolbar | ✅ | |

---

## Interactive Fiction Editor

| Feature | Status | Notes |
|---|---|---|
| Passage list with search | ✅ | |
| Add passage | ✅ | |
| Body / choice / conditional elements | ✅ | |
| Choice styled as mono code block | ✅ | |
| Conditional styled as amber block | ✅ | |
| Link count (counts `[[...]]` syntax) | ✅ | Counts from current session only |
| Passage count | ✅ | |
| Insert toolbar | ✅ | |
| Actual passage graph / preview | 🚧 | Not built — purely text-based for now |

---

## Tabletop RPG Editor

| Feature | Status | Notes |
|---|---|---|
| Section sidebar | ✅ | |
| Add section | ✅ | |
| H1 / H2 / body / stat block / table / callout / rule box | ✅ | |
| Collapsible stat blocks and tables | ✅ | |
| Word count | ✅ | |
| Insert toolbar with element types | ✅ | |
| Stat block / table markdown export | 🚧 | Not built |

---

## Beat Board (`/projects/[id]/beat-board`)

| Feature | Status | Notes |
|---|---|---|
| Canvas with draggable beat cards | ⚠️ | Components exist, route exists — untested |
| Story lanes | ⚠️ | Same |
| Create / delete beats | ⚠️ | Service calls wired, backend exists |
| Connections between beats | ⚠️ | Same |

---

## Outline Editor (`/projects/[id]/outline-editor`)

| Feature | Status | Notes |
|---|---|---|
| Outline document tree | ⚠️ | Components exist, route exists — untested |
| Story lanes view | ⚠️ | Same |
| Create / update / delete outline items | ⚠️ | Service calls wired |
| Timeline view | ⚠️ | Component exists |
| Link to beat board | ⚠️ | Navigation exists |

---

## Analytics (`/analytics`)

| Feature | Status | Notes |
|---|---|---|
| Overview page | ✅ | Computed from real scenes + elements |
| Scene breakdown | ✅ | Real scene list with INT/EXT, locations, characters |
| Dialogue analysis | ✅ | Real per-character line/word counts |
| Pacing analysis | ✅ | Word density per scene as pacing proxy |
| Character voice | ✅ | Real vocabulary richness + verbosity stats |
| Conflict analysis | ✅ | Dialogue density per scene as conflict proxy |

---

## Collaboration

| Feature | Status | Notes |
|---|---|---|
| Add collaborator by username | ⚠️ | Invitation created in DB, email delivery unknown |
| Pending invites page (`/invites`) | ⚠️ | Route exists, untested |
| Accept / decline invite | ⚠️ | Service calls exist, untested |
| Collaborator list on project | ✅ | |
| Role management (owner/editor/viewer) | ⚠️ | UI exists, save unknown |
| Real-time co-editing | 🚧 | Not built (edit_sessions table exists but no live sync) |
| Comments on screenplay elements | ⚠️ | Works for screenplay editor only |

---

## Settings (`/settings`)

| Feature | Status | Notes |
|---|---|---|
| Appearance (dark/light mode) | ✅ | Saved in localStorage |
| Account (username, display name, email) | 🔲 | UI only, no save |
| Security (change password, 2FA) | 🔲 | UI only |
| Notifications | 🔲 | UI only |
| Privacy | 🔲 | UI only |
| Data & export | 🔲 | UI only |
| Integrations | 🔲 | "Coming soon" placeholder |
| Billing | 🔲 | UI only, no Stripe integration |
| Collaboration (workspace member list) | 🔲 | UI only |
| Accessibility | 🔲 | UI only |
| Delete account | 🔲 | Dialog exists, no backend call |

---

## Admin (`/admin/billing`)

| Feature | Status | Notes |
|---|---|---|
| Tier management UI | 🔲 | UI only |
| Subscriptions overview | 🔲 | UI only |
| Gateway configuration | 🔲 | UI only |

---

## AI Features

| Feature | Status | Notes |
|---|---|---|
| AI Chat panel (screenplay editor) | ❌ | `ai-service` starts but is `unhealthy` — no Anthropic/OpenAI key configured |
| AI providers config | ❌ | Same |

**Fix needed:** Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) env var for `ai-service` in `.env` or `docker-compose.yml`.

---

## Infrastructure / DevEx

| Feature | Status | Notes |
|---|---|---|
| `task dev` (backends in Docker + Next.js local) | ✅ | Hot reload works |
| `task docker:rebuild:*` per-service | ✅ | |
| Proto generation (`make proto`) | ✅ | Requires `protoc-gen-go` in `~/go/bin` |
| DB migrations (auto-run on service start) | ✅ | golang-migrate |
| `category` column on projects | ✅ | Migration `000002_add_category` |

---

## Priority Fix List

### High — broken flows
1. **PoetryEditor section labels** — push label element to local state after creating it
2. **AI service** — configure API key so chat works
3. **Beat board / Outline editor** — test end-to-end, fix whatever's broken

### Medium — incomplete features
4. **Analytics** — compute from real project data instead of hardcoded values
5. **Settings → Account** — wire save to identity service (`PATCH /users/:id`)
6. **Collaboration invite flow** — test accept/decline end-to-end
7. **Export** — implement PDF/FDX export for screenplay

### Low — polish / future
8. **Real-time co-editing** — requires WebSocket / CRDT work
9. **Admin billing** — wire to billing service
10. **Settings remaining sections** — notifications, privacy, security
11. **IF passage graph view** — visual node graph for interactive fiction
12. **TTRPG table renderer** — parse pipe-table syntax into an actual `<table>`
