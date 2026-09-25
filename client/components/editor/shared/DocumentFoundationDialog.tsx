"use client"

import { useState } from "react"
import { Layers3 } from "lucide-react"

import {
  DOCUMENT_TEMPLATES, readDocumentRevisions,
  type DocumentRevision, type DocumentTemplate,
} from "@/lib/editor/document-foundation"
import type { Scene } from "@/services/project"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"

interface Props {
  category: "poetry" | "lyrics" | "prose"
  scene?: Scene
  onTemplate: (template: DocumentTemplate) => Promise<void>
  onCapture: (sceneId: string, label: string) => Promise<void>
  onVariant: (revision: DocumentRevision) => Promise<void>
}

export function DocumentFoundationDialog({ category, scene, onTemplate, onCapture, onVariant }: Props) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const revisions = scene ? readDocumentRevisions(scene.content) : []

  const perform = async (action: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await action()
      setOpen(false)
      setLabel("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't complete that action.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setError("") }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Templates and revisions">
          <Layers3 className="h-3.5 w-3.5" /> Templates & revisions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Templates & revisions</DialogTitle>
          <DialogDescription>Start a new {category === "poetry" ? "poem" : category === "lyrics" ? "song" : "chapter"} from a template, or save a snapshot of the current draft.</DialogDescription>
        </DialogHeader>
        <section className="grid gap-2" aria-label="Templates">
          <h3 className="text-sm font-semibold">Templates</h3>
          {DOCUMENT_TEMPLATES.filter((template) => template.category === category).map((template) => (
            <div key={template.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div><p className="text-sm font-medium">{template.label}</p><p className="text-xs text-muted-foreground">{template.description}</p></div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => onTemplate(template))}>Use</Button>
            </div>
          ))}
        </section>
        {scene && <section className="grid gap-2 border-t pt-4" aria-label="Revisions">
          <h3 className="text-sm font-semibold">Revisions of {scene.scene_heading || "untitled"}</h3>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void perform(() => onCapture(scene.id, label)) }}>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Revision name" placeholder="Revision name" required />
            <Button size="sm" type="submit" disabled={busy}>Save snapshot</Button>
          </form>
          {revisions.length === 0 && <p className="text-xs text-muted-foreground">No snapshots yet.</p>}
          {[...revisions].reverse().map((revision) => (
            <div key={revision.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div><p className="text-sm font-medium">{revision.label}</p><p className="text-xs text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</p></div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => onVariant(revision))}>Open as variant</Button>
            </div>
          ))}
        </section>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
