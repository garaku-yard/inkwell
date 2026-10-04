"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogScrollContent, DialogTitle } from "@/components/ui/dialog"
import type { ScreenplaySubmissionOptions } from "@/lib/export/screenplay-pdf"

export function ScreenplayExportDialog({ open, onOpenChange, onExport }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport: (options: ScreenplaySubmissionOptions) => void
}) {
  const [byline, setByline] = useState("")
  const [contact, setContact] = useState("")
  const [anonymous, setAnonymous] = useState(false)
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogScrollContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Screenplay submission PDF</DialogTitle>
        <DialogDescription>Review title page details before exporting. Some submissions require an anonymous copy.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 text-sm">
        <label className="flex items-center gap-3"><Checkbox checked={anonymous} onCheckedChange={checked => setAnonymous(checked === true)} />Anonymous copy</label>
        <label className="grid gap-1.5">Byline<Input value={byline} onChange={event => setByline(event.target.value)} disabled={anonymous} /></label>
        <label className="grid gap-1.5">Contact information<textarea value={contact} onChange={event => setContact(event.target.value)} disabled={anonymous} rows={3} className="border-input bg-background w-full rounded-md border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      </div>
      <DialogFooter><Button onClick={() => { onExport({ byline, contact, anonymous }); onOpenChange(false) }}>Export PDF</Button></DialogFooter>
    </DialogScrollContent>
  </Dialog>
}
