/**
 * Shared module-scope helpers + Row type aliases used by more than one
 * local-storage domain file. Single-domain helpers live in their own
 * domain file instead.
 */

import Database from "@tauri-apps/plugin-sql"

import type {
  AuthResponse,
  Beat,
  Category,
  Character,
  Connection,
  CurrentUser,
  Lane,
  Location,
  OutlineItem,
  Project,
  Scene,
  ScriptElement,
  Workspace,
} from "@/lib/storage"
import { NotSupportedError } from "../errors"

// ─── Connection (lazy singleton) ──────────────────────────────────────────

let dbPromise: Promise<Database> | null = null

/** Lazily opens the SQLite connection. The plugin runs migrations registered
 *  on the Rust side the first time the DB is opened, so no extra setup is
 *  needed here. */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:inkwell.db")
  }
  return dbPromise
}

// ─── Row types + helpers ─────────────────────────────────────────────────

export const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001"

export function now(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return crypto.randomUUID()
}

export interface ProjectRow {
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

export function toProject(row: ProjectRow): Project {
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

export interface SceneRow {
  id: string
  project_id: string
  outline_unit_id: string | null
  scene_heading: string
  content: string
  order_index: number
  created_at: string
  updated_at: string
}

export function toScene(row: SceneRow): Scene {
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

export interface ElementRow {
  id: string
  project_id: string
  scene_id: string | null
  element_type: string
  content: string
  line_number: number
  formatting_json: string
  created_at: string
  updated_at: string
}

export function toElement(row: ElementRow): ScriptElement {
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
    line_number: row.line_number,
    formatting,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export interface CharacterRow {
  id: string
  project_id: string
  name: string
  description: string
  role: string
  attributes_json: string
  created_at: string
  updated_at: string
}

export function toCharacter(row: CharacterRow): Character {
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

export interface LocationRow {
  id: string
  project_id: string
  name: string
  description: string
  type: string
  created_at: string
  updated_at: string
}

export function toLocation(row: LocationRow): Location {
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

export interface BeatRow {
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

export function toBeat(row: BeatRow): Beat {
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

export interface ConnectionRow {
  id: string
  from_id: string
  to_id: string
  from_side: string
  to_side: string
}

export function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    fromSide: row.from_side as Connection["fromSide"],
    toSide: row.to_side as Connection["toSide"],
  }
}

export interface LaneRow {
  id: string
  name: string
  color: string
  order_index: number
}

export function toLane(row: LaneRow): Lane {
  return { id: row.id, name: row.name, color: row.color, order: row.order_index }
}

export interface OutlineItemRow {
  id: string
  project_id: string
  beat_id: string
  lane_id: string
  order_index: number
  timeline_position: number | null
  width: number | null
}

export function toOutlineItem(row: OutlineItemRow): OutlineItem {
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

export interface WorkspaceRow {
  id: string
  name: string
  slug: string
  type: string
  owner_id: string
  avatar_url: string | null
  description: string | null
  categories_json: string
}

export function toWorkspace(row: WorkspaceRow): Workspace {
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
export const BUILTIN_CATEGORIES: Category[] = [
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

export function slugifyCategory(slug: string): Category {
  const found = BUILTIN_CATEGORIES.find((c) => c.slug === slug)
  if (found) return found
  return { id: `cat-${slug}`, slug, name: slug, description: "", icon: "Folder" }
}

// ─── User profile ────────────────────────────────────────────────────────

export async function ensureUserProfile(): Promise<CurrentUser> {
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

export function toAuthResponse(me: CurrentUser): AuthResponse {
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

// ─── Collaboration / admin / AI — not supported locally ─────────────────

export function reject(feature: string): never {
  throw new NotSupportedError(feature)
}
