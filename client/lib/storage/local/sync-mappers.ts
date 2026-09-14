/** Pure wire-format mappers for the desktop sync engine, split out from
 *  {@link ./sync} so they can be unit-tested without the SQLite plugin.
 *
 *  The gateway speaks protojson with proto field names (snake_case) and renders
 *  common.Timestamp as { seconds, nanos } (seconds is a string). These convert
 *  to/from the ISO-8601 strings the SQLite columns hold, and reshape local rows
 *  into the proto field names (act → act_number, order_index → order, etc.). */

export interface Ts {
  seconds: string | number
  nanos?: number
}

/** Loose row record; the field set per entity is handled by the mappers. */
export type Row = Record<string, unknown>

/** ISO string → { seconds, nanos }, or undefined for null/empty (so it's
 *  omitted from the pushed JSON and the server treats it as unset). */
export function toTs(iso: string | null | undefined): Ts | undefined {
  if (!iso) return undefined
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return undefined
  return { seconds: Math.floor(ms / 1000), nanos: (ms % 1000) * 1_000_000 }
}

/** { seconds, nanos } → ISO string, or null when absent. */
export function fromTs(ts: Ts | null | undefined): string | null {
  if (!ts) return null
  const ms = Number(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000)
  return new Date(ms).toISOString()
}

/** Parse a JSON-object column to a string map, never throwing. */
export function parseJSON(s: string | null | undefined): Record<string, string> {
  if (!s || s === "{}") return {}
  try {
    return JSON.parse(s) as Record<string, string>
  } catch {
    return {}
  }
}

const r = (row: Row, key: string) => row[key] as string
const ri = (row: Row, key: string) => row[key] as number

// ─── local row → proto-json (push) ───────────────────────────────────────────
//
// updated_at is omitted from every row (the server stamps it). owner_id is
// omitted from the project (the gateway forces it to the authenticated user).

export function pushProject(row: Row): Row {
  return {
    id: r(row, "id"), title: r(row, "title"), description: r(row, "description"),
    category: r(row, "category"), status: r(row, "status"),
    is_starred: ri(row, "is_starred") === 1,
    ...(r(row, "org_id") ? { org_id: r(row, "org_id") } : {}),
    created_at: toTs(r(row, "created_at")), deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushScene(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"),
    outline_unit_id: r(row, "outline_unit_id") || undefined,
    scene_heading: r(row, "scene_heading"), content: r(row, "content"),
    order_index: ri(row, "order_index"),
    created_at: toTs(r(row, "created_at")), deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushElement(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"), scene_id: r(row, "scene_id") || undefined,
    type: r(row, "element_type"), content: r(row, "content"), line_number: ri(row, "line_number"),
    formatting: parseJSON(r(row, "formatting_json")),
    created_at: toTs(r(row, "created_at")), deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushCharacter(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"), name: r(row, "name"),
    description: r(row, "description"), role: r(row, "role"),
    attributes: parseJSON(r(row, "attributes_json")),
    created_at: toTs(r(row, "created_at")), deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushLocation(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"), name: r(row, "name"),
    description: r(row, "description"), type: r(row, "type"),
    created_at: toTs(r(row, "created_at")), deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushBeat(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"), title: r(row, "title"),
    description: r(row, "description"), scene_numbers: r(row, "scene_numbers"), color: r(row, "color"),
    position_x: ri(row, "position_x"), position_y: ri(row, "position_y"),
    width: ri(row, "width"), height: ri(row, "height"),
    act_number: ri(row, "act"), order: ri(row, "order_index"),
    start_page: ri(row, "start_page"), end_page: ri(row, "end_page"),
    image_url: r(row, "image_url") || undefined,
    deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushConnection(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"),
    from_beat_id: r(row, "from_id"), to_beat_id: r(row, "to_id"),
    from_side: r(row, "from_side"), to_side: r(row, "to_side"),
    deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushLane(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"), name: r(row, "name"),
    color: r(row, "color"), order: ri(row, "order_index"),
    deleted_at: toTs(r(row, "deleted_at")),
  }
}
export function pushOutlineItem(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"),
    beat_id: r(row, "beat_id"), lane_id: r(row, "lane_id"), order: ri(row, "order_index"),
    timeline_position: row["timeline_position"], width: row["width"],
    deleted_at: toTs(r(row, "deleted_at")),
  }
}
/** A drawing's `data` crosses the wire as the JSON string it is stored as — the
 *  server never looks inside a shape (decisions/0022), so parsing it here only to
 *  re-encode it would be work that can only lose information. */
export function pushDrawing(row: Row): Row {
  return {
    id: r(row, "id"), project_id: r(row, "project_id"),
    kind: r(row, "kind"), data: r(row, "data"), order: ri(row, "order_index"),
    deleted_at: toTs(r(row, "deleted_at")),
  }
}
