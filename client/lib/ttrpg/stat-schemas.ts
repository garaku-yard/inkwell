/** Project-owned stat block shapes. IDs, rather than names, connect instances to
 * templates so renaming a shape or field does not break existing blocks. */
export interface StatField {
  id: string
  label: string
  kind: "text" | "number" | "choice"
  options?: string[]
}

export interface StatSchema {
  id: string
  name: string
  fields: StatField[]
}

export interface StatInstance {
  schemaId: string
  name: string
  values: Record<string, string>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

export function parseStatSchemas(value: unknown): StatSchema[] {
  let decoded = value
  if (typeof value === "string") {
    try { decoded = JSON.parse(value) } catch { return [] }
  }
  if (!Array.isArray(decoded)) return []
  return decoded.filter((schema): schema is StatSchema =>
    isRecord(schema) && typeof schema.id === "string" && typeof schema.name === "string" &&
    Array.isArray(schema.fields) && schema.fields.every((field: unknown) =>
      isRecord(field) && typeof field.id === "string" && typeof field.label === "string" &&
      (field.kind === "text" || field.kind === "number" || field.kind === "choice") &&
      (field.options === undefined ||
        (Array.isArray(field.options) && field.options.every((option: unknown) => typeof option === "string"))),
    ),
  )
}

export function parseStatInstance(content: string): StatInstance | null {
  try {
    const value: unknown = JSON.parse(content)
    if (!isRecord(value) || typeof value.schemaId !== "string" ||
      typeof value.name !== "string" || !isRecord(value.values)) return null
    if (!Object.values(value.values).every((entry) => typeof entry === "string")) return null
    return value as unknown as StatInstance
  } catch {
    return null
  }
}

export function validateStatInstance(instance: StatInstance, schema: StatSchema): string | null {
  if (instance.schemaId !== schema.id) return `This block does not use the ${schema.name} schema.`
  if (!instance.name.trim()) return "Give the stat block a name."
  for (const field of schema.fields) {
    const value = instance.values[field.id] ?? ""
    if (field.kind === "number" && value.trim() && !Number.isFinite(Number(value))) {
      return `${field.label} must be a number.`
    }
    if (field.kind === "choice" && value.trim() && !field.options?.includes(value)) {
      return `${field.label} must be one of: ${(field.options ?? []).join(", ")}.`
    }
  }
  return null
}

export function statInstanceToText(instance: StatInstance, schema?: StatSchema): string {
  if (!schema) return [instance.name, ...Object.entries(instance.values).map(([id, value]) => `${id}: ${value}`)].join("\n")
  return [instance.name, ...schema.fields.map((field) => `${field.label}: ${instance.values[field.id] ?? ""}`)].join("\n")
}
