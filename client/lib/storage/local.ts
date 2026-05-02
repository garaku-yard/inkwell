/**
 * Local Storage implementation — backed by SQLite via `tauri-plugin-sql`.
 *
 * This is what the desktop build uses: every call reads/writes the user's
 * on-disk `inkwell.db` inside the Tauri appdata dir. There is no network
 * involvement, no central account, and no collaboration.
 *
 * ## Capabilities
 *
 * The `capabilities` set declared at the bottom names only what this
 * implementation can honour. Anything else (`collaboration`, `realtime`,
 * `admin`) throws {@link NotSupportedError} — the UI is expected to
 * probe `storage.capabilities.has(...)` and hide those affordances
 * rather than call them.
 *
 * ## Auth model
 *
 * The desktop app has no login flow. `auth.me()` returns (or lazily creates)
 * a single-row `user_profile` record so the React auth layer sees "always
 * signed in." `login` / `register` are no-ops that return the same profile
 * so the existing login/register pages still work if they're hit.
 *
 * ## Database lifetime
 *
 * The plugin handles migrations in Rust (`src-tauri/migrations/0001_initial.sql`).
 * The first call to {@link getDb} lazily opens the connection; subsequent
 * calls reuse it for the lifetime of the webview.
 */

import Database from "@tauri-apps/plugin-sql"
import {
  readDir,
  readTextFile,
  writeTextFile,
  remove,
  exists,
  mkdir,
  rename,
} from "@tauri-apps/plugin-fs"

import type {
  AdminBillingStorage,
  AIChatRequest,
  AIProviderSettings,
  AiStorage,
  AuthResponse,
  AuthStorage,
  BeatBoardStorage,
  Beat,
  BeatBoardData,
  Capability,
  Category,
  Character,
  CharacterStorage,
  CollaborationStorage,
  Connection,
  CurrentUser,
  ElementStorage,
  FullProject,
  Lane,
  Location,
  LocationStorage,
  OutlineItem,
  Project,
  ProjectStorage,
  SaveProviderSettingsInput,
  Scene,
  SceneStorage,
  ScriptElement,
  SettingsStorage,
  Storage,
  UpdateProfileResponse,
  VaultBacklink,
  VaultGraphEdge,
  VaultGraphNode,
  VaultNote,
  VaultStorage,
  VaultTag,
  Workspace,
  WorkspaceStorage,
  WorkspacesResponse,
} from "./index"
import { NotSupportedError } from "./errors"
import { getAdapter } from "@/lib/ai/providers"
import type { AdapterMessage, ProviderKind, StreamChunk } from "@/lib/ai/providers"
import { deleteSecret, getSecret, setSecret } from "@/lib/secrets"
import { rewriteWikilinks } from "@/lib/vault/wikilink-sweep"

// ─── Connection (lazy singleton) ──────────────────────────────────────────

let dbPromise: Promise<Database> | null = null

/** Lazily opens the SQLite connection. The plugin runs migrations registered
 *  on the Rust side the first time the DB is opened, so no extra setup is
 *  needed here. */
function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:inkwell.db")
  }
  return dbPromise
}

// ─── Row types + helpers ─────────────────────────────────────────────────

const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001"

function now(): string {
  return new Date().toISOString()
}

function newId(): string {
  return crypto.randomUUID()
}

interface ProjectRow {
  id: string
  workspace_id: string | null
  title: string
  description: string
  owner_id: string
  category: string
  status: string
  is_starred: number
  created_at: string
  updated_at: string
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    owner_id: row.owner_id,
    category: row.category as Project["category"],
    status: row.status,
    is_starred: row.is_starred === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface SceneRow {
  id: string
  project_id: string
  outline_unit_id: string | null
  scene_heading: string
  content: string
  order_index: number
  created_at: string
  updated_at: string
}

function toScene(row: SceneRow): Scene {
  return {
    id: row.id,
    project_id: row.project_id,
    outline_unit_id: row.outline_unit_id ?? undefined,
    // Same nil-coercion contract as toElement: every downstream
    // consumer can call string methods on these without null checks.
    scene_heading: row.scene_heading ?? "",
    content: row.content ?? "",
    order_index: row.order_index,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface ElementRow {
  id: string
  project_id: string
  scene_id: string | null
  element_type: string
  content: string
  character_id: string | null
  line_number: number
  formatting_json: string
  created_at: string
  updated_at: string
}

function toElement(row: ElementRow): ScriptElement {
  let formatting: Record<string, string> = {}
  try {
    formatting = JSON.parse(row.formatting_json || "{}")
  } catch {
    // Corrupt JSON — treat as empty rather than fail the whole query.
  }
  return {
    id: row.id,
    project_id: row.project_id,
    scene_id: row.scene_id ?? undefined,
    element_type: row.element_type,
    // SQLite may return NULL for content (especially on rows created
    // by older migrations or external edits). Coerce to empty string
    // here so every downstream consumer can safely call .trim() /
    // .toLowerCase() / .split() without nil checks.
    content: row.content ?? "",
    character_id: row.character_id ?? undefined,
    line_number: row.line_number,
    formatting,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface CharacterRow {
  id: string
  project_id: string
  name: string
  description: string
  role: string
  attributes_json: string
  created_at: string
  updated_at: string
}

function toCharacter(row: CharacterRow): Character {
  let attributes: Record<string, string> = {}
  try {
    attributes = JSON.parse(row.attributes_json || "{}")
  } catch {
    /* empty */
  }
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    role: row.role,
    attributes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface LocationRow {
  id: string
  project_id: string
  name: string
  description: string
  type: string
  created_at: string
  updated_at: string
}

function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    type: row.type,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface BeatRow {
  id: string
  project_id: string
  title: string
  description: string
  scene_numbers: string
  color: string
  position_x: number
  position_y: number
  width: number
  height: number
  act: number
  order_index: number
  start_page: number | null
  end_page: number | null
  image_url: string | null
}

function toBeat(row: BeatRow): Beat {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sceneNumbers: row.scene_numbers,
    color: row.color,
    position: { x: row.position_x, y: row.position_y },
    width: row.width,
    height: row.height,
    act: row.act,
    order: row.order_index,
    startPage: row.start_page,
    endPage: row.end_page,
    imageUrl: row.image_url ?? undefined,
  }
}

interface ConnectionRow {
  id: string
  from_id: string
  to_id: string
  from_side: string
  to_side: string
}

function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    fromSide: row.from_side as Connection["fromSide"],
    toSide: row.to_side as Connection["toSide"],
  }
}

interface LaneRow {
  id: string
  name: string
  color: string
  order_index: number
}

function toLane(row: LaneRow): Lane {
  return { id: row.id, name: row.name, color: row.color, order: row.order_index }
}

interface OutlineItemRow {
  id: string
  project_id: string
  beat_id: string
  lane_id: string
  order_index: number
  timeline_position: number | null
  width: number | null
}

function toOutlineItem(row: OutlineItemRow): OutlineItem {
  return {
    id: row.id,
    projectId: row.project_id,
    beatId: row.beat_id,
    laneId: row.lane_id,
    order: row.order_index,
    timelinePosition: row.timeline_position ?? undefined,
    width: row.width ?? undefined,
  }
}

interface WorkspaceRow {
  id: string
  name: string
  slug: string
  type: string
  owner_id: string
  avatar_url: string | null
  description: string | null
  categories_json: string
}

function toWorkspace(row: WorkspaceRow): Workspace {
  let categories: Category[] = []
  try {
    categories = JSON.parse(row.categories_json || "[]")
  } catch {
    /* empty */
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type as Workspace["type"],
    owner_id: row.owner_id,
    avatar_url: row.avatar_url ?? undefined,
    description: row.description ?? undefined,
    categories,
  }
}

// ─── Built-in categories ─────────────────────────────────────────────────

/** Desktop categories are baked-in constants — no category table. Matches
 *  what the workspace-service would return in the hosted build. */
const BUILTIN_CATEGORIES: Category[] = [
  { id: "cat-screenplay", slug: "screenplay", name: "Screenplay", description: "Film and TV scripts.", icon: "Film" },
  { id: "cat-novel", slug: "novel", name: "Prose", description: "Novels, novellas, short fiction.", icon: "BookOpen" },
  { id: "cat-poetry", slug: "poetry", name: "Poetry", description: "Poems and verse.", icon: "Feather" },
  { id: "cat-comic", slug: "comic_script", name: "Comic Script", description: "Comic book scripts.", icon: "BookImage" },
  { id: "cat-ttrpg", slug: "tabletop_rpg", name: "TTRPG", description: "Tabletop RPG content.", icon: "Dice3" },
  { id: "cat-if", slug: "interactive_fiction", name: "Interactive Fiction", description: "Choice-based stories.", icon: "GitFork" },
  { id: "cat-memoir", slug: "memoir", name: "Memoir", description: "Memoirs and personal narratives.", icon: "User" },
  { id: "cat-lyrics", slug: "lyrics", name: "Lyrics", description: "Song lyrics and compositions.", icon: "Music" },
  { id: "cat-vault", slug: "vault", name: "Vault", description: "Markdown notes linked with [[wikilinks]].", icon: "Notebook" },
]

function slugifyCategory(slug: string): Category {
  const found = BUILTIN_CATEGORIES.find((c) => c.slug === slug)
  if (found) return found
  return { id: `cat-${slug}`, slug, name: slug, description: "", icon: "Folder" }
}

// ─── User profile ────────────────────────────────────────────────────────

async function ensureUserProfile(): Promise<CurrentUser> {
  const db = await getDb()
  const rows = await db.select<
    Array<{
      id: string
      email: string
      username: string
      user_tag: string
      first_name: string
      last_name: string
      role: string
    }>
  >("SELECT * FROM user_profile LIMIT 1")

  if (rows.length > 0) {
    const r = rows[0]
    return {
      id: r.id,
      email: r.email,
      username: r.username,
      tag: r.user_tag,
      role: r.role || "user",
      name: r.first_name,
      lastName: r.last_name,
    }
  }

  // Seed a single local profile on first launch. The user is free to edit
  // the username/email later via Settings.
  const ts = now()
  await db.execute(
    `INSERT INTO user_profile (id, email, username, user_tag, first_name, last_name, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [LOCAL_USER_ID, "you@inkwell.local", "writer", "0001", "", "", "user", ts, ts],
  )
  return {
    id: LOCAL_USER_ID,
    email: "you@inkwell.local",
    username: "writer",
    tag: "0001",
    role: "user",
    name: "",
    lastName: "",
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────

const auth: AuthStorage = {
  login: async (): Promise<AuthResponse> => {
    const me = await ensureUserProfile()
    return toAuthResponse(me)
  },
  register: async (): Promise<AuthResponse> => {
    const me = await ensureUserProfile()
    return toAuthResponse(me)
  },
  logout: async () => {
    // Local sessions don't exist; nothing to revoke.
  },
  me: async () => ensureUserProfile(),
}

function toAuthResponse(me: CurrentUser): AuthResponse {
  return {
    user: {
      id: me.id,
      email: me.email,
      username: me.username,
      usernameTag: me.tag,
      name: me.name,
      lastName: me.lastName,
      role: me.role,
      createdAt: now(),
      updatedAt: now(),
    },
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────

const projects: ProjectStorage = {
  create: async (input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO projects (id, title, description, owner_id, category, status, is_starred, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', 0, ?, ?)`,
      [
        id,
        input.title,
        input.description ?? "",
        input.owner_id,
        input.category ?? "screenplay",
        ts,
        ts,
      ],
    )
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [id])
    return toProject(rows[0])
  },

  getById: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [projectId])
    if (rows.length === 0) throw new Error(`Project not found: ${projectId}`)
    return toProject(rows[0])
  },

  getFull: async (projectId, userId) => {
    const project = await projects.getById(projectId, userId)
    const sceneRows = await (await getDb()).select<SceneRow[]>(
      "SELECT * FROM scenes WHERE project_id = ? ORDER BY order_index",
      [projectId],
    )
    const scenes = await Promise.all(
      sceneRows.map(async (s) => {
        const elementRows = await (await getDb()).select<ElementRow[]>(
          "SELECT * FROM script_elements WHERE scene_id = ? ORDER BY line_number",
          [s.id],
        )
        return {
          ...toScene(s),
          elements: elementRows.map(toElement),
          comments: [],
        }
      }),
    )
    const full: FullProject = { ...project, scenes }
    return full
  },

  listOwned: async (userId) => {
    const db = await getDb()
    const rows = await db.select<ProjectRow[]>(
      "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
      [userId],
    )
    const list = rows.map(toProject)
    return { projects: list, total: list.length }
  },

  listShared: async () => [],

  update: async (projectId, _userId, patch) => {
    const db = await getDb()
    const ts = now()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.title !== undefined) {
      sets.push("title = ?")
      args.push(patch.title)
    }
    if (patch.description !== undefined) {
      sets.push("description = ?")
      args.push(patch.description)
    }
    if (patch.status !== undefined) {
      sets.push("status = ?")
      args.push(patch.status)
    }
    sets.push("updated_at = ?")
    args.push(ts)
    args.push(projectId)
    await db.execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, args)
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [projectId])
    return toProject(rows[0])
  },

  toggleStar: async (projectId) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE projects SET is_starred = 1 - is_starred, updated_at = ? WHERE id = ?",
      [ts, projectId],
    )
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [projectId])
    return toProject(rows[0])
  },

  delete: async (projectId) => {
    const db = await getDb()
    await db.execute("DELETE FROM projects WHERE id = ?", [projectId])
  },
}

// ─── Scenes ───────────────────────────────────────────────────────────────

const scenes: SceneStorage = {
  create: async (projectId, _userId, input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO scenes (id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.outline_unit_id ?? null,
        input.scene_heading,
        input.content ?? "",
        input.order_index ?? 0,
        ts,
        ts,
      ],
    )
    const rows = await db.select<SceneRow[]>("SELECT * FROM scenes WHERE id = ?", [id])
    return toScene(rows[0])
  },

  listForProject: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<SceneRow[]>(
      "SELECT * FROM scenes WHERE project_id = ? ORDER BY order_index",
      [projectId],
    )
    return rows.map(toScene)
  },

  updateHeading: async (sceneId, _userId, heading) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE scenes SET scene_heading = ?, updated_at = ? WHERE id = ?",
      [heading, ts, sceneId],
    )
    const rows = await db.select<SceneRow[]>("SELECT * FROM scenes WHERE id = ?", [sceneId])
    return toScene(rows[0])
  },

  delete: async (sceneId) => {
    const db = await getDb()
    await db.execute("DELETE FROM scenes WHERE id = ?", [sceneId])
  },
}

// ─── Elements ─────────────────────────────────────────────────────────────

const elements: ElementStorage = {
  create: async (input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    // Scene must already exist; look up project_id so the element row carries
    // both ids (the outline editor queries by project_id).
    const sceneRows = await db.select<Array<{ project_id: string }>>(
      "SELECT project_id FROM scenes WHERE id = ?",
      [input.sceneId],
    )
    const projectId = sceneRows[0]?.project_id ?? ""
    await db.execute(
      `INSERT INTO script_elements (id, project_id, scene_id, element_type, content, character_id, line_number, formatting_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
      [
        id,
        projectId,
        input.sceneId,
        input.elementType,
        input.content,
        input.characterId ?? null,
        input.elementOrder,
        ts,
        ts,
      ],
    )
    const rows = await db.select<ElementRow[]>(
      "SELECT * FROM script_elements WHERE id = ?",
      [id],
    )
    return toElement(rows[0])
  },

  listForScene: async (sceneId) => {
    const db = await getDb()
    const rows = await db.select<ElementRow[]>(
      "SELECT * FROM script_elements WHERE scene_id = ? ORDER BY line_number",
      [sceneId],
    )
    return rows.map(toElement)
  },

  update: async (elementId, patch) => {
    const db = await getDb()
    const ts = now()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.content !== undefined) {
      sets.push("content = ?")
      args.push(patch.content)
    }
    if (patch.elementType !== undefined) {
      sets.push("element_type = ?")
      args.push(patch.elementType)
    }
    sets.push("updated_at = ?")
    args.push(ts)
    args.push(elementId)
    await db.execute(`UPDATE script_elements SET ${sets.join(", ")} WHERE id = ?`, args)
    const rows = await db.select<ElementRow[]>(
      "SELECT * FROM script_elements WHERE id = ?",
      [elementId],
    )
    return toElement(rows[0])
  },

  delete: async (elementId) => {
    const db = await getDb()
    await db.execute("DELETE FROM script_elements WHERE id = ?", [elementId])
  },

  listForProject: async (projectId, _userId, startLine, endLine) => {
    const db = await getDb()
    let sql = "SELECT * FROM script_elements WHERE project_id = ?"
    const args: (string | number)[] = [projectId]
    if (startLine !== undefined) {
      sql += " AND line_number >= ?"
      args.push(startLine)
    }
    if (endLine !== undefined) {
      sql += " AND line_number <= ?"
      args.push(endLine)
    }
    sql += " ORDER BY line_number"
    const rows = await db.select<ElementRow[]>(sql, args)
    return rows.map(toElement)
  },
}

// ─── Characters / locations ──────────────────────────────────────────────

const characters: CharacterStorage = {
  create: async (projectId, _userId, input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO characters (id, project_id, name, description, role, attributes_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.name,
        input.description ?? "",
        input.role ?? "",
        JSON.stringify(input.attributes ?? {}),
        ts,
        ts,
      ],
    )
    const rows = await db.select<CharacterRow[]>("SELECT * FROM characters WHERE id = ?", [id])
    return toCharacter(rows[0])
  },

  listForProject: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<CharacterRow[]>(
      "SELECT * FROM characters WHERE project_id = ? ORDER BY name",
      [projectId],
    )
    return rows.map(toCharacter)
  },
}

const locations: LocationStorage = {
  create: async (projectId, _userId, input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO locations (id, project_id, name, description, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, input.name, input.description ?? "", input.type ?? "", ts, ts],
    )
    const rows = await db.select<LocationRow[]>("SELECT * FROM locations WHERE id = ?", [id])
    return toLocation(rows[0])
  },

  listForProject: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<LocationRow[]>(
      "SELECT * FROM locations WHERE project_id = ? ORDER BY name",
      [projectId],
    )
    return rows.map(toLocation)
  },
}

// ─── Beat board ───────────────────────────────────────────────────────────

const beatBoard: BeatBoardStorage = {
  getBoard: async (projectId) => {
    const db = await getDb()
    const [beatRows, connRows, laneRows, itemRows] = await Promise.all([
      db.select<BeatRow[]>(
        "SELECT * FROM beats WHERE project_id = ? ORDER BY act, order_index",
        [projectId],
      ),
      db.select<ConnectionRow[]>(
        "SELECT * FROM connections WHERE project_id = ?",
        [projectId],
      ),
      db.select<LaneRow[]>(
        "SELECT * FROM lanes WHERE project_id = ? ORDER BY order_index",
        [projectId],
      ),
      db.select<OutlineItemRow[]>(
        "SELECT * FROM outline_items WHERE project_id = ? ORDER BY order_index",
        [projectId],
      ),
    ])
    const board: BeatBoardData = {
      beats: beatRows.map(toBeat),
      connections: connRows.map(toConnection),
      lanes: laneRows.map(toLane),
      outlineItems: itemRows.map(toOutlineItem),
    }
    return board
  },

  createBeat: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO beats (id, project_id, title, description, scene_numbers, color, position_x, position_y, width, height, act, order_index, start_page, end_page, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.title ?? "",
        input.description ?? "",
        input.sceneNumbers ?? "",
        input.color ?? "#FFFFFF",
        input.position?.x ?? 0,
        input.position?.y ?? 0,
        input.width ?? 200,
        input.height ?? 100,
        input.act ?? 1,
        input.order ?? 0,
        input.startPage ?? null,
        input.endPage ?? null,
        input.imageUrl ?? null,
      ],
    )
    const rows = await db.select<BeatRow[]>("SELECT * FROM beats WHERE id = ?", [id])
    return toBeat(rows[0])
  },

  updateBeat: async (beatId, patch) => {
    const db = await getDb()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    const push = (col: string, val: string | number | null | undefined) => {
      if (val === undefined) return
      sets.push(`${col} = ?`)
      args.push(val)
    }
    push("title", patch.title)
    push("description", patch.description)
    push("scene_numbers", patch.sceneNumbers)
    push("color", patch.color)
    push("position_x", patch.position?.x)
    push("position_y", patch.position?.y)
    push("width", patch.width)
    push("height", patch.height)
    push("act", patch.act)
    push("order_index", patch.order)
    push("start_page", patch.startPage ?? null)
    push("end_page", patch.endPage ?? null)
    push("image_url", patch.imageUrl ?? null)
    if (sets.length > 0) {
      args.push(beatId)
      await db.execute(`UPDATE beats SET ${sets.join(", ")} WHERE id = ?`, args)
    }
    const rows = await db.select<BeatRow[]>("SELECT * FROM beats WHERE id = ?", [beatId])
    return toBeat(rows[0])
  },

  deleteBeat: async (beatId) => {
    const db = await getDb()
    await db.execute("DELETE FROM beats WHERE id = ?", [beatId])
  },

  createConnection: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO connections (id, project_id, from_id, to_id, from_side, to_side)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.fromId ?? "",
        input.toId ?? "",
        input.fromSide ?? "right",
        input.toSide ?? "left",
      ],
    )
    const rows = await db.select<ConnectionRow[]>(
      "SELECT * FROM connections WHERE id = ?",
      [id],
    )
    return toConnection(rows[0])
  },

  deleteConnection: async (connectionId) => {
    const db = await getDb()
    await db.execute("DELETE FROM connections WHERE id = ?", [connectionId])
  },

  createLane: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO lanes (id, project_id, name, color, order_index) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, input.name ?? "Lane", input.color ?? "#CCCCCC", input.order ?? 0],
    )
    const rows = await db.select<LaneRow[]>("SELECT * FROM lanes WHERE id = ?", [id])
    return toLane(rows[0])
  },

  updateLane: async (laneId, patch) => {
    const db = await getDb()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.name !== undefined) {
      sets.push("name = ?")
      args.push(patch.name)
    }
    if (patch.color !== undefined) {
      sets.push("color = ?")
      args.push(patch.color)
    }
    if (patch.order !== undefined) {
      sets.push("order_index = ?")
      args.push(patch.order)
    }
    if (sets.length === 0) return
    args.push(laneId)
    await db.execute(`UPDATE lanes SET ${sets.join(", ")} WHERE id = ?`, args)
  },

  updateLaneOrder: async (_projectId, orderedIds) => {
    const db = await getDb()
    for (let i = 0; i < orderedIds.length; i++) {
      await db.execute("UPDATE lanes SET order_index = ? WHERE id = ?", [i, orderedIds[i]])
    }
  },

  createOutlineItem: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO outline_items (id, project_id, beat_id, lane_id, order_index, timeline_position, width)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.beatId ?? "",
        input.laneId ?? "",
        input.order ?? 0,
        input.timelinePosition ?? null,
        input.width ?? null,
      ],
    )
    const rows = await db.select<OutlineItemRow[]>(
      "SELECT * FROM outline_items WHERE id = ?",
      [id],
    )
    return toOutlineItem(rows[0])
  },

  updateOutlineItem: async (itemId, patch) => {
    const db = await getDb()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.beatId !== undefined) {
      sets.push("beat_id = ?")
      args.push(patch.beatId)
    }
    if (patch.laneId !== undefined) {
      sets.push("lane_id = ?")
      args.push(patch.laneId)
    }
    if (patch.order !== undefined) {
      sets.push("order_index = ?")
      args.push(patch.order)
    }
    if (patch.timelinePosition !== undefined) {
      sets.push("timeline_position = ?")
      args.push(patch.timelinePosition)
    }
    if (patch.width !== undefined) {
      sets.push("width = ?")
      args.push(patch.width)
    }
    if (sets.length === 0) return
    args.push(itemId)
    await db.execute(`UPDATE outline_items SET ${sets.join(", ")} WHERE id = ?`, args)
  },

  deleteOutlineItem: async (itemId) => {
    const db = await getDb()
    await db.execute("DELETE FROM outline_items WHERE id = ?", [itemId])
  },
}

// ─── Workspaces (local-only; no members/invites) ──────────────────────────

const workspaces: WorkspaceStorage = {
  listCategories: async () => BUILTIN_CATEGORIES,

  list: async () => {
    const db = await getDb()
    const rows = await db.select<WorkspaceRow[]>(
      "SELECT * FROM workspaces ORDER BY name",
    )
    const all = rows.map(toWorkspace)
    const out: WorkspacesResponse = {
      personal: all.filter((w) => w.type !== "org"),
      org: all.filter((w) => w.type === "org"),
    }
    return out
  },

  createPersonal: async (_userId, categorySlugs) => {
    const me = await ensureUserProfile()
    const db = await getDb()
    const created: Workspace[] = []
    for (const slug of categorySlugs) {
      const id = newId()
      const ts = now()
      const cats = [slugifyCategory(slug)]
      await db.execute(
        `INSERT INTO workspaces (id, name, slug, type, owner_id, avatar_url, description, categories_json, created_at, updated_at)
         VALUES (?, ?, ?, 'personal', ?, NULL, NULL, ?, ?, ?)`,
        [id, `${slug} workspace`, slug, me.id, JSON.stringify(cats), ts, ts],
      )
      const rows = await db.select<WorkspaceRow[]>(
        "SELECT * FROM workspaces WHERE id = ?",
        [id],
      )
      created.push(toWorkspace(rows[0]))
    }
    return { workspaces: created }
  },

  createOrg: async (input) => {
    const me = await ensureUserProfile()
    const db = await getDb()
    const id = newId()
    const ts = now()
    const cats = (input.category_slugs ?? []).map(slugifyCategory)
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    await db.execute(
      `INSERT INTO workspaces (id, name, slug, type, owner_id, avatar_url, description, categories_json, created_at, updated_at)
       VALUES (?, ?, ?, 'org', ?, NULL, ?, ?, ?, ?)`,
      [id, input.name, slug, me.id, input.description ?? null, JSON.stringify(cats), ts, ts],
    )
    const rows = await db.select<WorkspaceRow[]>(
      "SELECT * FROM workspaces WHERE id = ?",
      [id],
    )
    return toWorkspace(rows[0])
  },

  get: async (workspaceId) => {
    const db = await getDb()
    const rows = await db.select<WorkspaceRow[]>(
      "SELECT * FROM workspaces WHERE id = ?",
      [workspaceId],
    )
    if (rows.length === 0) throw new Error(`Workspace not found: ${workspaceId}`)
    return toWorkspace(rows[0])
  },

  update: async (workspaceId, patch) => {
    const db = await getDb()
    const ts = now()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.name !== undefined) {
      sets.push("name = ?")
      args.push(patch.name)
    }
    if (patch.description !== undefined) {
      sets.push("description = ?")
      args.push(patch.description ?? null)
    }
    if (patch.avatar_url !== undefined) {
      sets.push("avatar_url = ?")
      args.push(patch.avatar_url ?? null)
    }
    sets.push("updated_at = ?")
    args.push(ts)
    args.push(workspaceId)
    await db.execute(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`, args)
    return workspaces.get(workspaceId)
  },

  delete: async (workspaceId) => {
    const db = await getDb()
    await db.execute("DELETE FROM workspaces WHERE id = ?", [workspaceId])
  },

  enableCategory: async (workspaceId, slug) => {
    const ws = await workspaces.get(workspaceId)
    const next = [...ws.categories.filter((c) => c.slug !== slug), slugifyCategory(slug)]
    const db = await getDb()
    await db.execute(
      "UPDATE workspaces SET categories_json = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(next), now(), workspaceId],
    )
    return workspaces.get(workspaceId)
  },

  disableCategory: async (workspaceId, slug) => {
    const ws = await workspaces.get(workspaceId)
    const next = ws.categories.filter((c) => c.slug !== slug)
    const db = await getDb()
    await db.execute(
      "UPDATE workspaces SET categories_json = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(next), now(), workspaceId],
    )
    return workspaces.get(workspaceId)
  },
}

// ─── Collaboration / admin / AI — not supported locally ─────────────────

function reject(feature: string): never {
  throw new NotSupportedError(feature)
}

const collaboration: CollaborationStorage = {
  addCollaborator: () => reject("collaboration"),
  listCollaborators: async () => [],
  updateCollaboratorRole: () => reject("collaboration"),
  removeCollaborator: () => reject("collaboration"),
  addComment: () => reject("collaboration"),
  listComments: async () => [],
  updateComment: () => reject("collaboration"),
  deleteComment: async () => {
    /* no-op */
  },
  listMembers: async () => [],
  inviteMember: () => reject("collaboration"),
  removeMember: () => reject("collaboration"),
  updateMemberRole: () => reject("collaboration"),
  acceptWorkspaceInvite: () => reject("collaboration"),
  declineWorkspaceInvite: () => reject("collaboration"),
  listPendingInvitations: async () => [],
  acceptInvitation: () => reject("collaboration"),
  declineInvitation: () => reject("collaboration"),
}

const adminBilling: AdminBillingStorage = {
  getTiers: () => reject("admin"),
  getTier: () => reject("admin"),
  createTier: () => reject("admin"),
  updateTier: () => reject("admin"),
  deleteTier: () => reject("admin"),
  reorderTiers: () => reject("admin"),
  getGateways: () => reject("admin"),
  getGatewayConfig: () => reject("admin"),
  updateGatewayConfig: () => reject("admin"),
  setActiveGateway: () => reject("admin"),
  toggleGatewayTestMode: () => reject("admin"),
  listUserSubscriptions: () => reject("admin"),
  getUserSubscription: () => reject("admin"),
  syncSubscription: () => reject("admin"),
  overrideUserLimits: () => reject("admin"),
  getUserUsage: () => reject("admin"),
  getTierUsageStats: () => reject("admin"),
  listAuditLogs: () => reject("admin"),
  getAnalytics: () => reject("admin"),
}

// ─── AI (BYO keys, keychain-backed) ──────────────────────────────────────

interface AIProviderRow {
  id: string
  kind: string
  label: string
  enabled: number
  base_url: string | null
  default_model: string | null
  key_version: number
  created_at: number
  updated_at: number
}

const AI_COLUMNS =
  "id, kind, label, enabled, base_url, default_model, key_version, created_at, updated_at"

function keychainKey(providerId: string): string {
  return `ai.${providerId}`
}

function rowToSettings(row: AIProviderRow, hasKey: boolean): AIProviderSettings {
  return {
    id: row.id,
    kind: row.kind as ProviderKind,
    label: row.label,
    enabled: row.enabled === 1,
    baseUrl: row.base_url ?? undefined,
    defaultModel: row.default_model ?? undefined,
    hasKey,
  }
}

async function hasStoredKey(providerId: string): Promise<boolean> {
  try {
    const v = await getSecret(keychainKey(providerId))
    return v !== null
  } catch {
    return false
  }
}

async function loadProviderSettings(): Promise<AIProviderSettings[]> {
  const db = await getDb()
  const rows = await db.select<AIProviderRow[]>(
    `SELECT ${AI_COLUMNS} FROM ai_providers ORDER BY created_at ASC`,
  )
  const out: AIProviderSettings[] = []
  for (const row of rows) {
    out.push(rowToSettings(row, await hasStoredKey(row.id)))
  }
  return out
}

async function loadProviderRow(id: string): Promise<AIProviderRow> {
  const db = await getDb()
  const rows = await db.select<AIProviderRow[]>(
    `SELECT ${AI_COLUMNS} FROM ai_providers WHERE id = ?`,
    [id],
  )
  if (rows.length === 0) {
    throw new Error(`AI provider ${id} not found`)
  }
  return rows[0]
}

function toAdapterMessages(messages: AIChatRequest["messages"]): AdapterMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

/** Wraps the adapter's normalized StreamChunk stream into the NDJSON
 *  byte stream the existing chat panel parser consumes. Each chunk emits
 *  `{"response":"<delta>"}\n`; the terminal chunk emits `{"done":true}\n`. */
function chunkStreamToNDJSON(
  src: ReadableStream<StreamChunk>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return src.pipeThrough(
    new TransformStream<StreamChunk, Uint8Array>({
      transform(chunk, controller) {
        if (chunk.delta.length > 0) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ response: chunk.delta }) + "\n"),
          )
        }
        if (chunk.done) {
          controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + "\n"))
        }
      },
    }),
  )
}

const ai: AiStorage = {
  async streamChat(
    request: AIChatRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<Uint8Array>> {
    if (!request.providerId) {
      throw new Error(
        "streamChat requires providerId — pick a configured provider in Settings → AI",
      )
    }
    const row = await loadProviderRow(request.providerId)
    if (row.enabled !== 1) {
      throw new Error(`AI provider "${row.label}" is disabled`)
    }
    const model = request.model ?? row.default_model
    if (!model) {
      throw new Error(
        `No model specified and no default model set for "${row.label}"`,
      )
    }
    const apiKey = await getSecret(keychainKey(row.id))
    const adapter = getAdapter(row.kind as ProviderKind)
    const stream = adapter.streamChat({
      messages: toAdapterMessages(request.messages),
      model,
      apiKey: apiKey ?? undefined,
      baseUrl: row.base_url ?? undefined,
      signal: options?.signal,
    })
    return chunkStreamToNDJSON(stream)
  },

  listProviderSettings: loadProviderSettings,

  async saveProviderSettings(
    input: SaveProviderSettingsInput,
  ): Promise<AIProviderSettings> {
    const db = await getDb()
    const ts = Date.now()
    const enabled = input.enabled ? 1 : 0

    if (input.id) {
      await db.execute(
        `UPDATE ai_providers
           SET kind = ?, label = ?, enabled = ?, base_url = ?, default_model = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.kind,
          input.label,
          enabled,
          input.baseUrl ?? null,
          input.defaultModel ?? null,
          ts,
          input.id,
        ],
      )
      return {
        id: input.id,
        kind: input.kind,
        label: input.label,
        enabled: input.enabled,
        baseUrl: input.baseUrl,
        defaultModel: input.defaultModel,
        hasKey: await hasStoredKey(input.id),
      }
    }

    const id = newId()
    await db.execute(
      `INSERT INTO ai_providers (${AI_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.kind,
        input.label,
        enabled,
        input.baseUrl ?? null,
        input.defaultModel ?? null,
        ts,
        ts,
      ],
    )
    return {
      id,
      kind: input.kind,
      label: input.label,
      enabled: input.enabled,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
      hasKey: false,
    }
  },

  async deleteProviderSettings(id: string): Promise<void> {
    const db = await getDb()
    await db.execute("DELETE FROM ai_providers WHERE id = ?", [id])
    await deleteSecret(keychainKey(id)).catch(() => {
      // Deletion is best-effort: the row is gone even if the keychain
      // entry can't be cleared (daemon down, already removed, etc.). The
      // orphan entry is harmless since nothing else references this id.
    })
  },

  async setApiKey(id: string, apiKey: string): Promise<void> {
    await setSecret(keychainKey(id), apiKey)
  },

  async clearApiKey(id: string): Promise<void> {
    await deleteSecret(keychainKey(id))
  },

  async testProvider(
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const row = await loadProviderRow(id)
      const apiKey = await getSecret(keychainKey(id))
      const model = row.default_model
      if (!model) {
        return {
          ok: false,
          error: "Set a default model before testing the connection.",
        }
      }
      const adapter = getAdapter(row.kind as ProviderKind)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const stream = adapter.streamChat({
          messages: [{ role: "user", content: "ping" }],
          model,
          apiKey: apiKey ?? undefined,
          baseUrl: row.base_url ?? undefined,
          signal: controller.signal,
        })
        const reader = stream.getReader()
        try {
          await reader.read()
        } finally {
          reader.releaseLock()
          await stream.cancel().catch(() => {})
        }
        return { ok: true }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },
}

// ─── Vault (markdown notes on disk) ──────────────────────────────────────

function joinPath(dir: string, filename: string): string {
  // Cross-platform join: prefer the OS separator already present in `dir`
  // when it's obviously Windows (`C:\`). Otherwise use `/` which Tauri's
  // fs plugin normalises on Windows too. Handles relative `filename` with
  // its own `/` separators — they get preserved when the base uses `/`
  // and flipped to `\\` on pure-Windows bases.
  const sep = /\\/.test(dir) && !/\//.test(dir) ? "\\" : "/"
  const cleanDir = dir.replace(/[\\/]+$/, "")
  const normalisedTail = sep === "\\" ? filename.replace(/\//g, "\\") : filename
  return `${cleanDir}${sep}${normalisedTail}`
}

/** Strips a leading `./` and collapses `\\` → `/` so we always carry
 *  forward-slash relative paths inside the app; the OS-specific join is
 *  only applied when we hand the path to the filesystem. */
function normaliseRelPath(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "")
}

/** Sanitises a single path segment — folder name or note title. */
function sanitiseSegment(segment: string): string {
  const cleaned = segment
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
  return cleaned
}

// ─── Backlinks index ─────────────────────────────────────────────────────

/** Projects whose `note_links` rows we've reconciled this session.
 *  Prevents doing a full vault scan on every `listNotes`. */
const vaultIndexBuilt = new Set<string>()

/** Matches `[[Target]]` and `[[Target|Alias]]`. Bounded length keeps a
 *  stray `[[` from running away; non-greedy to avoid swallowing the next
 *  closing bracket in a sequence of links. */
const WIKILINK_PATTERN = /\[\[\s*([^\]|]{1,200}?)(?:\s*\|[^\]]{0,200})?\s*\]\]/g

/** Matches `#tag` / `#nested/tag`. Must be preceded by whitespace or
 *  start-of-string so `foo#bar` and URL fragments don't count. First
 *  character can't be a digit to keep numeric-only strings out —
 *  matches Obsidian's convention. Allows `_ - /` inside, forward slash
 *  for nested tags (`#project/alpha`). */
const TAG_PATTERN = /(?:^|\s)(#[A-Za-z_][\w\-/]{0,100})/g

function extractTags(body: string): string[] {
  // Strip fenced code blocks and inline code spans first — `#define`
  // in a code sample isn't a tag.
  const stripped = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
  const out = new Set<string>()
  // Preserve first-seen casing per lowered key.
  const canonByLower = new Map<string, string>()
  let m: RegExpExecArray | null
  TAG_PATTERN.lastIndex = 0
  while ((m = TAG_PATTERN.exec(stripped)) !== null) {
    // Drop the leading `#` and trim any trailing slash (e.g. `#foo/`).
    const tag = m[1].slice(1).replace(/\/+$/, "")
    if (!tag) continue
    const lower = tag.toLowerCase()
    if (!canonByLower.has(lower)) canonByLower.set(lower, tag)
    out.add(lower)
  }
  // Return in original casing, sorted alphabetical.
  return Array.from(out)
    .map((lower) => canonByLower.get(lower)!)
    .sort((a, b) => a.localeCompare(b))
}

/** Replaces every note_links + note_tags row for a given source file.
 *  Called on writeNote + during the initial full scan. Both indexes are
 *  rebuilt in one pass so the filesystem watcher can lean on a single
 *  entry point. */
async function reindexNoteLinks(
  projectId: string,
  filename: string,
  body: string,
): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    "DELETE FROM note_links WHERE project_id = ? AND from_filename = ?",
    [projectId, filename],
  )
  // We need the original (non-lowered) target so the backlinks UI can
  // show "Page" rather than "page". Re-parse the body to keep casing.
  const seen = new Set<string>()
  const lines = body.split(/\r?\n/)
  for (const line of lines) {
    WIKILINK_PATTERN.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKILINK_PATTERN.exec(line)) !== null) {
      const title = m[1].trim()
      if (!title) continue
      const key = title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      await db.execute(
        `INSERT OR REPLACE INTO note_links (project_id, from_filename, to_title, snippet, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, filename, title, line.trim().slice(0, 200), ts],
      )
    }
  }

  // Tags — wipe + re-insert. Parse against the full body (not per line)
  // because fenced code blocks span multiple lines and the extractor
  // handles stripping those internally.
  await db.execute(
    "DELETE FROM note_tags WHERE project_id = ? AND from_filename = ?",
    [projectId, filename],
  )
  for (const tag of extractTags(body)) {
    await db.execute(
      `INSERT OR REPLACE INTO note_tags (project_id, from_filename, tag, updated_at)
       VALUES (?, ?, ?, ?)`,
      [projectId, filename, tag, ts],
    )
  }
}

/** Recursively walks `folder` and returns every `.md` file it finds,
 *  yielding the relative path from the top-level folder (forward-slash
 *  separated) plus the matching absolute path. Hidden files starting
 *  with `.` are skipped so `.obsidian/` / `.git/` don't pollute the list. */
async function walkMarkdownFiles(
  folder: string,
  relPrefix = "",
): Promise<Array<{ rel: string; abs: string }>> {
  const out: Array<{ rel: string; abs: string }> = []
  let entries: Awaited<ReturnType<typeof readDir>>
  try {
    entries = await readDir(folder)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    const childAbs = joinPath(folder, entry.name)
    if (entry.isDirectory) {
      const nested = await walkMarkdownFiles(childAbs, childRel)
      out.push(...nested)
    } else if (entry.isFile && entry.name.toLowerCase().endsWith(".md")) {
      out.push({ rel: childRel, abs: childAbs })
    }
  }
  return out
}

/** Ensures every `.md` file in the vault has an up-to-date row set in
 *  `note_links`. Cheap no-op on subsequent calls — the in-memory
 *  `vaultIndexBuilt` set short-circuits repeated work per session. */
async function ensureVaultIndex(
  projectId: string,
  folder: string,
): Promise<void> {
  if (vaultIndexBuilt.has(projectId)) return
  const files = await walkMarkdownFiles(folder)
  for (const file of files) {
    try {
      const body = await readTextFile(file.abs)
      await reindexNoteLinks(projectId, file.rel, body)
    } catch {
      // Skip unreadable files silently; they just won't participate in
      // backlinks until the user opens them.
    }
  }
  vaultIndexBuilt.add(projectId)
}

async function getVaultPathOrThrow(projectId: string): Promise<string> {
  const db = await getDb()
  const rows = await db.select<Array<{ vault_path: string | null }>>(
    "SELECT vault_path FROM projects WHERE id = ?",
    [projectId],
  )
  const path = rows[0]?.vault_path
  if (!path) {
    throw new Error(
      `Vault project ${projectId} has no folder attached. Pick one via the folder picker first.`,
    )
  }
  return path
}

const vault: VaultStorage = {
  openVault: async (projectId, folderPath) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE projects SET vault_path = ?, updated_at = ? WHERE id = ?",
      [folderPath, ts, projectId],
    )
  },

  getVaultPath: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<Array<{ vault_path: string | null }>>(
      "SELECT vault_path FROM projects WHERE id = ?",
      [projectId],
    )
    return rows[0]?.vault_path ?? null
  },

  listNotes: async (projectId) => {
    const folder = await getVaultPathOrThrow(projectId)
    // One-time-per-session full scan so backlinks work for notes that
    // already existed on disk before we had an index. Fast: O(files).
    await ensureVaultIndex(projectId, folder)

    const files = await walkMarkdownFiles(folder)
    const notes: VaultNote[] = files.map((file) => {
      const lastSlash = file.rel.lastIndexOf("/")
      const folderPart = lastSlash === -1 ? "" : file.rel.slice(0, lastSlash)
      const nameOnly = lastSlash === -1 ? file.rel : file.rel.slice(lastSlash + 1)
      return {
        filename: file.rel,
        path: file.abs,
        title: nameOnly.replace(/\.md$/i, ""),
        folder: folderPart,
        // `readDir` doesn't expose mtime; we'd need `stat` to fill this in.
        // For v0 use an empty string so the UI just falls back to the name.
        updatedAt: "",
      }
    })
    // Sort by full relative path so the tree UI gets stable ordering —
    // folders surface together, then files alphabetical per folder.
    notes.sort((a, b) => a.filename.localeCompare(b.filename))
    return notes
  },

  readNote: async (projectId, filename) => {
    const folder = await getVaultPathOrThrow(projectId)
    return readTextFile(joinPath(folder, normaliseRelPath(filename)))
  },

  writeNote: async (projectId, filename, content) => {
    const folder = await getVaultPathOrThrow(projectId)
    const rel = normaliseRelPath(filename)
    // Ensure the parent folder exists before writing. Cheap idempotent
    // mkdir — no harm if the directory is already there.
    const lastSlash = rel.lastIndexOf("/")
    if (lastSlash !== -1) {
      await mkdir(joinPath(folder, rel.slice(0, lastSlash)), {
        recursive: true,
      }).catch(() => {
        /* parent dir likely already exists */
      })
    }
    await writeTextFile(joinPath(folder, rel), content)
    // Keep the backlinks index in sync with every save; the cost is one
    // SQL write per wikilink in the note, negligible for human-sized notes.
    await reindexNoteLinks(projectId, rel, content)
  },

  createNote: async (projectId, title, folder) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const base = sanitiseSegment(title) || "Untitled"

    // `folder` may contain nested segments like `projects/alpha`. Each is
    // sanitised separately so a stray slash in the title doesn't escape
    // the vault. Empty-string or undefined folder → root-level note.
    const folderRel = folder
      ? normaliseRelPath(folder)
          .split("/")
          .map(sanitiseSegment)
          .filter((s) => s.length > 0)
          .join("/")
      : ""
    if (folderRel) {
      await mkdir(joinPath(vaultRoot, folderRel), { recursive: true }).catch(() => {
        /* idempotent */
      })
    }

    const makeRel = (name: string) =>
      folderRel ? `${folderRel}/${name}` : name
    let rel = makeRel(`${base}.md`)
    let path = joinPath(vaultRoot, rel)
    for (let i = 2; i < 1000 && (await exists(path)); i++) {
      rel = makeRel(`${base} ${i}.md`)
      path = joinPath(vaultRoot, rel)
    }
    const body = `# ${title}\n\n`
    await writeTextFile(path, body)
    await reindexNoteLinks(projectId, rel, body)

    const lastSlash = rel.lastIndexOf("/")
    const nameOnly = lastSlash === -1 ? rel : rel.slice(lastSlash + 1)
    return {
      filename: rel,
      path,
      title: nameOnly.replace(/\.md$/i, ""),
      folder: folderRel,
      updatedAt: "",
    }
  },

  renameNote: async (projectId, filename, newTitle) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const oldRel = normaliseRelPath(filename)
    const sanitised = sanitiseSegment(newTitle)
    if (!sanitised) {
      throw new Error("The title can't be empty.")
    }

    const lastSlash = oldRel.lastIndexOf("/")
    const folderRel = lastSlash === -1 ? "" : oldRel.slice(0, lastSlash)
    const oldBasename = lastSlash === -1 ? oldRel : oldRel.slice(lastSlash + 1)
    const oldTitle = oldBasename.replace(/\.md$/i, "")

    // Same title (casing included) → nothing to do. Return the current
    // record so callers don't need a branch.
    if (oldTitle === sanitised) {
      const path = joinPath(vaultRoot, oldRel)
      return {
        filename: oldRel,
        path,
        title: oldTitle,
        folder: folderRel,
        updatedAt: now(),
      }
    }

    const newRel = folderRel ? `${folderRel}/${sanitised}.md` : `${sanitised}.md`
    const oldPath = joinPath(vaultRoot, oldRel)
    const newPath = joinPath(vaultRoot, newRel)

    // Collision guard — only when the target is a different file. A
    // case-only change on a case-insensitive FS lands on the same inode,
    // which is fine.
    if (
      newRel.toLowerCase() !== oldRel.toLowerCase() &&
      (await exists(newPath))
    ) {
      throw new Error(
        `A note named "${sanitised}" already exists in this folder.`,
      )
    }

    await rename(oldPath, newPath)

    // Sweep every other note's body for references to `oldTitle` and
    // rewrite them to `sanitised`. See lib/vault/wikilink-sweep for the
    // exact shapes covered (plain, alias, heading, heading+alias).
    const files = await walkMarkdownFiles(vaultRoot)
    for (const f of files) {
      if (f.rel === newRel) continue
      let body: string
      try {
        body = await readTextFile(f.abs)
      } catch {
        continue
      }
      const rewritten = rewriteWikilinks(body, oldTitle, sanitised)
      if (rewritten !== body) {
        await writeTextFile(f.abs, rewritten)
        await reindexNoteLinks(projectId, f.rel, rewritten)
      }
    }

    // Move the renamed file's own index row + retarget any row that
    // previously pointed at `oldTitle`.
    const db = await getDb()
    await db.execute(
      "UPDATE note_links SET from_filename = ? WHERE project_id = ? AND from_filename = ?",
      [newRel, projectId, oldRel],
    )
    await db.execute(
      "UPDATE note_links SET to_title = ? WHERE project_id = ? AND to_title = ? COLLATE NOCASE",
      [sanitised, projectId, oldTitle],
    )
    // Tag rows only key off from_filename — the tag text doesn't change
    // on rename, we just point the rows at the new filename.
    await db.execute(
      "UPDATE note_tags SET from_filename = ? WHERE project_id = ? AND from_filename = ?",
      [newRel, projectId, oldRel],
    )

    return {
      filename: newRel,
      path: newPath,
      title: sanitised,
      folder: folderRel,
      updatedAt: now(),
    }
  },

  deleteNote: async (projectId, filename) => {
    const folder = await getVaultPathOrThrow(projectId)
    const rel = normaliseRelPath(filename)
    await remove(joinPath(folder, rel))
    // Drop every outbound-from-this-file entry so deleted notes can't
    // appear as phantom backlink sources. Inbound rows (other notes
    // linking *to* this file) stay; they just won't resolve.
    const db = await getDb()
    await db.execute(
      "DELETE FROM note_links WHERE project_id = ? AND from_filename = ?",
      [projectId, rel],
    )
    await db.execute(
      "DELETE FROM note_tags WHERE project_id = ? AND from_filename = ?",
      [projectId, rel],
    )
  },

  createFolder: async (projectId, relPath) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const segments = normaliseRelPath(relPath)
      .split("/")
      .map(sanitiseSegment)
      .filter((s) => s.length > 0)
    if (segments.length === 0) return
    await mkdir(joinPath(vaultRoot, segments.join("/")), { recursive: true })
  },

  deleteFolder: async (projectId, relPath) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const rel = normaliseRelPath(relPath)
    if (!rel) return
    await remove(joinPath(vaultRoot, rel), { recursive: true })
    // Clean the backlinks index of every note that used to live here.
    // LIKE with the folder prefix catches nested notes as well.
    const db = await getDb()
    const prefix = `${rel}/`
    await db.execute(
      "DELETE FROM note_links WHERE project_id = ? AND (from_filename = ? OR from_filename LIKE ?)",
      [projectId, rel, `${prefix}%`],
    )
    await db.execute(
      "DELETE FROM note_tags WHERE project_id = ? AND (from_filename = ? OR from_filename LIKE ?)",
      [projectId, rel, `${prefix}%`],
    )
  },

  reindexLinks: async (projectId, filename) => {
    // Called by the filesystem watcher when an external tool touches a
    // `.md` file. Keeps the backlinks index honest without waiting for
    // the user to re-save from Inkwell.
    const folder = await getVaultPathOrThrow(projectId)
    const path = joinPath(folder, filename)
    if (!(await exists(path))) {
      // File was deleted or renamed — drop its outbound rows so it stops
      // showing up as a backlink source.
      const db = await getDb()
      await db.execute(
        "DELETE FROM note_links WHERE project_id = ? AND from_filename = ?",
        [projectId, filename],
      )
      await db.execute(
        "DELETE FROM note_tags WHERE project_id = ? AND from_filename = ?",
        [projectId, filename],
      )
      return
    }
    try {
      const body = await readTextFile(path)
      await reindexNoteLinks(projectId, filename, body)
    } catch {
      // A writer may still be holding the file (atomic-write patterns
      // briefly rename a temp file into place). Skip this batch — the
      // watcher will fire again when the write settles.
    }
  },

  getGraph: async (projectId) => {
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)

    // Nodes: one per `.md` file on disk. We also build a lowered-title
    // → filename map so we can resolve `to_title` rows back to a real
    // node (SQL stores the target title, not filename, because the
    // target may not exist yet when the link is written).
    const files = await walkMarkdownFiles(folder)
    const titleToFile = new Map<string, string>()
    const nodes: VaultGraphNode[] = []
    for (const f of files) {
      const lastSlash = f.rel.lastIndexOf("/")
      const basename = lastSlash === -1 ? f.rel : f.rel.slice(lastSlash + 1)
      const title = basename.replace(/\.md$/i, "")
      titleToFile.set(title.toLowerCase(), f.rel)
      nodes.push({ filename: f.rel, title, degree: 0 })
    }

    const db = await getDb()
    const rows = await db.select<
      Array<{ from_filename: string; to_title: string }>
    >(
      "SELECT from_filename, to_title FROM note_links WHERE project_id = ?",
      [projectId],
    )

    const nodeIndex = new Map<string, VaultGraphNode>()
    for (const n of nodes) nodeIndex.set(n.filename, n)

    const edges: VaultGraphEdge[] = []
    const seenPair = new Set<string>()
    for (const row of rows) {
      const from = row.from_filename
      const to = titleToFile.get(row.to_title.toLowerCase())
      if (!to) continue // phantom target — no node to connect
      if (from === to) continue // self-link
      // Deduplicate undirected pair — A→B + B→A collapse to one line.
      const key = from < to ? `${from}|${to}` : `${to}|${from}`
      if (seenPair.has(key)) continue
      seenPair.add(key)
      edges.push({ from, to })
      const a = nodeIndex.get(from)
      const b = nodeIndex.get(to)
      if (a) a.degree++
      if (b) b.degree++
    }

    return { nodes, edges }
  },

  listTags: async (projectId) => {
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)
    const db = await getDb()
    const rows = await db.select<Array<{ tag: string; n: number }>>(
      `SELECT tag, COUNT(*) AS n
       FROM note_tags
       WHERE project_id = ?
       GROUP BY tag COLLATE NOCASE
       ORDER BY n DESC, tag COLLATE NOCASE ASC`,
      [projectId],
    )
    const results: VaultTag[] = rows.map((r) => ({ tag: r.tag, count: r.n }))
    return results
  },

  getNotesByTag: async (projectId, tag) => {
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)
    const db = await getDb()
    const rows = await db.select<Array<{ from_filename: string }>>(
      `SELECT from_filename
       FROM note_tags
       WHERE project_id = ? AND tag = ? COLLATE NOCASE
       ORDER BY from_filename`,
      [projectId, tag],
    )
    return rows.map((r) => r.from_filename)
  },

  getBacklinks: async (projectId, title) => {
    const target = title.trim()
    if (!target) return []
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)
    const db = await getDb()
    const rows = await db.select<
      Array<{ from_filename: string; snippet: string }>
    >(
      `SELECT from_filename, snippet
       FROM note_links
       WHERE project_id = ? AND to_title = ? COLLATE NOCASE
       ORDER BY from_filename`,
      [projectId, target],
    )
    const results: VaultBacklink[] = []
    for (const row of rows) {
      const sourceTitle = row.from_filename.replace(/\.md$/i, "")
      // Self-links are filtered at read time rather than write time so the
      // index stays authoritative even after a rename.
      if (sourceTitle.toLowerCase() === target.toLowerCase()) continue
      results.push({
        filename: row.from_filename,
        title: sourceTitle,
        snippet: row.snippet,
      })
    }
    return results
  },
}

// ─── Settings (local profile + BYO-key AI keys land here) ────────────────

const settings: SettingsStorage = {
  updateProfile: async (data) => {
    const me = await ensureUserProfile()
    const db = await getDb()
    const ts = now()
    await db.execute(
      `UPDATE user_profile SET username = COALESCE(?, username), email = COALESCE(?, email), updated_at = ? WHERE id = ?`,
      [data.username ?? null, data.email ?? null, ts, me.id],
    )
    const updated = await ensureUserProfile()
    const resp: UpdateProfileResponse = {
      id: updated.id,
      username: updated.username,
      usernameTag: updated.tag,
      name: updated.name,
      lastName: updated.lastName,
      email: updated.email,
    }
    return resp
  },
  changePassword: async () => {
    // No password exists locally; expose as no-op rather than rejecting so
    // the settings page doesn't feel broken.
  },
  verifyPassword: async () => true,
  deleteAccount: async () => {
    const db = await getDb()
    // Wipes everything. Irreversible.
    await db.execute("DELETE FROM projects")
    await db.execute("DELETE FROM workspaces")
    await db.execute("DELETE FROM user_profile")
  },
  requestDataDeletion: async () => ({
    id: newId(),
    userId: LOCAL_USER_ID,
    status: "completed",
    createdAt: now(),
    completedAt: now(),
  }),
  getDataDeletionStatus: async () => null,
  clearCache: async () => {
    if (typeof window !== "undefined") {
      localStorage.clear()
      sessionStorage.clear()
    }
  },
}

// ─── Root Storage ─────────────────────────────────────────────────────────

/** Capabilities honoured by the local build. Notable omissions: `auth`
 *  (no real login), `collaboration`, `realtime`, `admin`. BYO AI
 *  providers are supported because we have the OS keychain and a direct
 *  client-side adapter library. */
const LOCAL_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "ai.byo",
])

/** Returns a Storage backed by local SQLite via `tauri-plugin-sql`. */
export function createLocalStorage(): Storage {
  return {
    capabilities: LOCAL_CAPABILITIES,
    auth,
    projects,
    scenes,
    elements,
    characters,
    locations,
    beatBoard,
    workspaces,
    collaboration,
    settings,
    vault,
    ai,
    admin: { billing: adminBilling },
  }
}
