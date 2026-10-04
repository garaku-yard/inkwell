"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogScrollContent, DialogTitle } from "@/components/ui/dialog"
import { manuscriptSubmissionDefaults, type ManuscriptProfile, type ManuscriptSubmissionOptions } from "@/lib/export/manuscript-options"
import type { FullProject } from "@/services/project"

export function ManuscriptExportDialog({
  project, profile, format, open, onOpenChange, onExport,
}: {
  project: FullProject
  profile: ManuscriptProfile
  format: "pdf" | "docx"
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport: (options: ManuscriptSubmissionOptions) => void
}) {
  const [options, setOptions] = useState<Required<ManuscriptSubmissionOptions>>(() => manuscriptSubmissionDefaults(project, profile))
  const set = <K extends keyof ManuscriptSubmissionOptions>(key: K, value: Required<ManuscriptSubmissionOptions>[K]) =>
    setOptions(current => ({ ...current, [key]: value }))

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogScrollContent className="sm:max-w-[540px]">
      <DialogHeader>
        <DialogTitle>{profile === "poetry" ? "Poetry" : "Prose"} submission {format.toUpperCase()}</DialogTitle>
        <DialogDescription>Choose the submission layout. Your manuscript content stays the same.{profile === "poetry" ? " Long lines wrap with a hanging indent; exact spatial positioning is not preserved." : ""}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 text-sm">
        <label className="flex items-center gap-3"><Checkbox checked={options.titlePage} onCheckedChange={checked => set("titlePage", checked === true)} />Include title page</label>
        <label className="grid gap-1.5">Byline<Input value={options.byline} onChange={event => set("byline", event.target.value)} placeholder="Name as it should appear" disabled={!options.titlePage} /></label>
        <label className="grid gap-1.5">Contact information<textarea value={options.contact} onChange={event => set("contact", event.target.value)} rows={3} placeholder="Shown on title page" disabled={!options.titlePage} className="border-input bg-background w-full rounded-md border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <label className="grid gap-1.5">Running header<Input value={options.runningHeader} onChange={event => set("runningHeader", event.target.value)} placeholder="Title or surname / title" /></label>
        <label className="grid gap-1.5">Line spacing<select value={options.lineSpacing} onChange={event => set("lineSpacing", event.target.value as Required<ManuscriptSubmissionOptions>["lineSpacing"])} className="border-input bg-background h-9 rounded-md border px-3">
          <option value="single">Single</option><option value="one-and-half">1.5 lines</option><option value="double">Double</option>
        </select></label>
        <label className="flex items-center gap-3"><Checkbox checked={options.pageNumbers} onCheckedChange={checked => set("pageNumbers", checked === true)} />Include page numbers</label>
      </div>
      <DialogFooter><Button onClick={() => { onExport(options); onOpenChange(false) }}>Export {format.toUpperCase()}</Button></DialogFooter>
    </DialogScrollContent>
  </Dialog>
}
