"use client"

import { useState } from "react"
import { FileText } from "lucide-react"

import { documentDiagnostics, readDocumentMetadata, type DocumentMetadata } from "@/lib/editor/document-metadata"
import type { Scene } from "@/services/project"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"

interface Props {
  scene: Scene
  label: "Poem" | "Song" | "Chapter"
  onSave: (sceneId: string, metadata: DocumentMetadata) => Promise<void>
}

export function DocumentMetadataDialog({ scene, label, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [metadata, setMetadata] = useState<DocumentMetadata>(() => readDocumentMetadata(scene.content))
  const [tagsText, setTagsText] = useState(() => readDocumentMetadata(scene.content).tags?.join(", ") ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const diagnostics = documentDiagnostics(scene)

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      const current = readDocumentMetadata(scene.content)
      setMetadata(current)
      setTagsText(current.tags?.join(", ") ?? "")
      setError("")
    }
    setOpen(nextOpen)
  }

  const update = (field: keyof DocumentMetadata, value: string) =>
    setMetadata((current) => ({ ...current, [field]: value }))
  const updateNumber = (field: "targetLines" | "targetSyllables" | "tempo" | "capo", value: string) =>
    setMetadata((current) => ({ ...current, [field]: value === "" ? undefined : Number(value) }))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      await onSave(scene.id, { ...metadata, tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean) })
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save metadata.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" aria-label={`${label} metadata`}>
          <FileText className="h-3.5 w-3.5" /> Metadata
          {diagnostics.length > 0 && <span className="sr-only">, {diagnostics.length} warning</span>}
        </Button>
      </DialogTrigger>
      <DialogScrollContent>
        <DialogHeader>
          <DialogTitle>{label} metadata</DialogTitle>
          <DialogDescription>Details for {scene.scene_heading || `this ${label.toLowerCase()}`} stay with the document.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="grid gap-3">
          <label className="grid gap-1 text-sm">Subtitle
            <Input value={metadata.subtitle ?? ""} onChange={(event) => update("subtitle", event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">Synopsis
            <Textarea value={metadata.synopsis ?? ""} onChange={(event) => update("synopsis", event.target.value)} />
          </label>
          {label === "Chapter" && <label className="grid gap-1 text-sm">Point of view
            <Input value={metadata.pointOfView ?? ""} onChange={(event) => update("pointOfView", event.target.value)} />
          </label>}
          <label className="grid gap-1 text-sm">Status
            <Input value={metadata.status ?? ""} onChange={(event) => update("status", event.target.value)} placeholder="Draft, revised, ready…" />
          </label>
          <label className="grid gap-1 text-sm">Dedication
            <Input value={metadata.dedication ?? ""} onChange={(event) => update("dedication", event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">Epigraph
            <Textarea value={metadata.epigraph ?? ""} onChange={(event) => update("epigraph", event.target.value)} />
          </label>
          {label === "Poem" && <>
            <label className="grid gap-1 text-sm">Form
              <Input value={metadata.form ?? ""} onChange={(event) => update("form", event.target.value)} placeholder="Sonnet, villanelle, free verse…" />
            </label>
            <label className="grid gap-1 text-sm">Meter
              <Input value={metadata.meter ?? ""} onChange={(event) => update("meter", event.target.value)} placeholder="Iambic pentameter, common meter…" />
            </label>
            <label className="grid gap-1 text-sm">Line alignment
              <select className="h-9 rounded-md border bg-background px-3" value={metadata.alignment ?? "left"} onChange={(event) => update("alignment", event.target.value)}>
                <option value="left">Left</option><option value="center">Center</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">Editor line numbers
              <select className="h-9 rounded-md border bg-background px-3" value={metadata.lineNumbering ?? "every5"} onChange={(event) => update("lineNumbering", event.target.value)}>
                <option value="none">None</option><option value="every5">Every fifth line</option><option value="all">Every line</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">Target lines (advisory)
              <Input type="number" min="1" value={metadata.targetLines ?? ""} onChange={(event) => updateNumber("targetLines", event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Target syllables per line (advisory)
              <Input type="number" min="1" value={metadata.targetSyllables ?? ""} onChange={(event) => updateNumber("targetSyllables", event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Rhyme scheme (advisory)
              <Input value={metadata.rhymeScheme ?? ""} onChange={(event) => update("rhymeScheme", event.target.value)} placeholder="ABAB CDCD EFEF GG" />
            </label>
          </>}
          {label === "Song" && <>
            <label className="grid gap-1 text-sm">Artist
              <Input value={metadata.artist ?? ""} onChange={(event) => update("artist", event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Album
              <Input value={metadata.album ?? ""} onChange={(event) => update("album", event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Key
              <Input value={metadata.key ?? ""} onChange={(event) => update("key", event.target.value)} placeholder="C, F#m…" />
            </label>
            <label className="grid gap-1 text-sm">Tempo (BPM)
              <Input type="number" min="1" value={metadata.tempo ?? ""} onChange={(event) => updateNumber("tempo", event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Time signature
              <Input value={metadata.time ?? ""} onChange={(event) => update("time", event.target.value)} placeholder="4/4" />
            </label>
            <label className="grid gap-1 text-sm">Capo
              <Input type="number" min="0" value={metadata.capo ?? ""} onChange={(event) => updateNumber("capo", event.target.value)} />
            </label>
          </>}
          <label className="grid gap-1 text-sm">Tags, separated by commas
            <Input value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
          </label>
          {diagnostics.length > 0 && <div role="status" className="text-sm text-amber-700 dark:text-amber-400">
            {diagnostics.map((diagnostic) => <p key={diagnostic.code}>{diagnostic.message}</p>)}
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save metadata"}</Button>
          </DialogFooter>
        </form>
      </DialogScrollContent>
    </Dialog>
  )
}
