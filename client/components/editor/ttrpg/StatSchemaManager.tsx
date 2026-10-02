"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { StatField, StatSchema } from "@/lib/ttrpg/stat-schemas"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  schemas: StatSchema[]
  onSave: (schema: StatSchema) => Promise<void>
  onInsert: (schema: StatSchema) => Promise<void>
}

const blankSchema = (): StatSchema => ({ id: crypto.randomUUID(), name: "", fields: [] })

/** Project-defined shapes are edited here; an instance keeps the schema and
 * field IDs, so changing display labels does not detach old values. */
export function StatSchemaManager({ open, onOpenChange, schemas, onSave, onInsert }: Props) {
  const [draft, setDraft] = useState<StatSchema>(() => blankSchema())
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const updateField = (id: string, patch: Partial<StatField>) =>
    setDraft((current) => ({ ...current, fields: current.fields.map((field) =>
      field.id === id ? { ...field, ...patch } : field,
    ) }))

  const save = async () => {
    const name = draft.name.trim()
    if (!name) return setError("Give this template a name.")
    if (schemas.some((schema) => schema.id !== draft.id && schema.name.toLowerCase() === name.toLowerCase())) {
      return setError("A template with that name already exists.")
    }
    if (draft.fields.some((field) => !field.label.trim())) return setError("Name every field.")
    if (new Set(draft.fields.map((field) => field.label.trim().toLowerCase())).size !== draft.fields.length) {
      return setError("Field names must be unique.")
    }
    if (draft.fields.some((field) => field.kind === "choice" && !field.options?.length)) {
      return setError("Give every choice field at least one option.")
    }
    setSaving(true)
    setError("")
    try {
      await onSave({ ...draft, name, fields: draft.fields.map((field) => ({ ...field, label: field.label.trim() })) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this template.")
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Project stat block templates</DialogTitle>
        <DialogDescription>Define the fields used by Faults, Organisms, Systems, or any other game entity. Existing blocks keep their field values when labels change.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-2">
        {schemas.map((schema) => <Button key={schema.id} variant={draft.id === schema.id ? "default" : "outline"}
          size="sm" onClick={() => { setDraft(schema); setError("") }}>{schema.name}</Button>)}
        <Button variant="outline" size="sm" onClick={() => { setDraft(blankSchema()); setError("") }}>New template</Button>
      </div>
      <label className="grid gap-1 text-sm">Template name
        <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Fault" />
      </label>
      <div className="grid gap-3">
        <div className="flex items-center justify-between"><span className="text-sm font-medium">Fields</span>
          <Button variant="outline" size="sm" onClick={() => setDraft((current) => ({ ...current,
            fields: [...current.fields, { id: crypto.randomUUID(), label: "", kind: "text" }],
          }))}>Add field</Button>
        </div>
        {draft.fields.map((field) => <div key={field.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-start">
          <div className="grid gap-2">
            <Input aria-label="Field name" value={field.label} placeholder="Trigger" onChange={(event) => updateField(field.id, { label: event.target.value })} />
            {field.kind === "choice" && <Input aria-label={`${field.label || "Field"} choices`} value={(field.options ?? []).join(", ")}
              placeholder="draft, designed, tested" onChange={(event) => updateField(field.id, {
                options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
              })} />}
          </div>
          <select aria-label={`${field.label || "Field"} type`} className="h-9 rounded-md border bg-background px-2 text-sm" value={field.kind}
            onChange={(event) => updateField(field.id, { kind: event.target.value as StatField["kind"] })}>
            <option value="text">Text</option><option value="number">Number</option><option value="choice">Choice</option>
          </select>
          <Button variant="ghost" size="sm" aria-label={`Remove ${field.label || "field"}`}
            onClick={() => setDraft((current) => ({ ...current, fields: current.fields.filter((item) => item.id !== field.id) }))}>Remove</Button>
        </div>)}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {schemas.some((schema) => schema.id === draft.id) && <Button variant="outline" onClick={() => void onInsert(draft)}>Insert block</Button>}
        <Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save template"}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
