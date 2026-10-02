"use client"

import { useMemo, useState } from "react"
import { Hash, Music } from "lucide-react"
import { syllable } from "syllable"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogScrollContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { plainInlineText } from "@/lib/editor/inline-content"
import { readDocumentMetadata } from "@/lib/editor/document-metadata"
import { chordRowIssues, transposeChordRow } from "@/lib/editor/song-tools"
import type { Scene } from "@/services/project"

interface Props { scene: Scene; isLyrics: boolean; onTranspose?: (sceneId: string, semitones: number) => Promise<void> }

export function VerseToolsDialog({ scene, isLyrics, onTranspose }: Props) {
  const [semitones, setSemitones] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const metadata = readDocumentMetadata(scene.content)
  const lines = useMemo(() => (scene.elements ?? []).filter((el) => el.element_type === "line").map((el) => plainInlineText(el.content)), [scene.elements])
  const counts = lines.map((line) => line.trim() ? syllable(line) : 0)
  const chordRows = (scene.elements ?? []).filter((el) => el.element_type === "chord_row").map((el) => plainInlineText(el.content))
  const invalid = [...new Set(chordRows.flatMap(chordRowIssues))]
  const rhymeEndings = lines.map((line) => line.trim().toLowerCase().match(/[a-z]{2,}(?:['’][a-z]+)?[.!?]*$/)?.[0]?.replace(/[.!?]+$/, "") ?? "")
  const endingKeys = rhymeEndings.map((word) => word.match(/[aeiouy][^aeiouy]*$/)?.[0] ?? "")
  const uniqueEndings = [...new Set(endingKeys.filter(Boolean))]
  const endingGroups = endingKeys.map((ending) => ending ? String.fromCharCode(65 + uniqueEndings.indexOf(ending) % 26) : "–")

  return <Dialog>
    <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
      {isLyrics ? <Music className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
      {isLyrics ? "Song tools" : "Form tools"}
    </Button></DialogTrigger>
    <DialogScrollContent className="max-h-[80vh]">
      <DialogHeader>
        <DialogTitle>{isLyrics ? "Song tools" : "Poem form"}</DialogTitle>
        <DialogDescription>Analysis is advisory and never changes the manuscript.</DialogDescription>
      </DialogHeader>
      {isLyrics ? <div className="grid gap-3 text-sm">
        <p>{metadata.key ? `Key ${metadata.key}` : "No key set"}{metadata.tempo ? ` · ${metadata.tempo} BPM` : ""}{metadata.time ? ` · ${metadata.time}` : ""}</p>
        <label className="grid gap-1">Transpose chord preview (semitones)
          <Input type="number" min="-11" max="11" value={semitones} onChange={(event) => setSemitones(Number(event.target.value) || 0)} />
        </label>
        {invalid.length > 0 && <p role="status" className="text-amber-700 dark:text-amber-400">Unrecognized chords: {invalid.join(", ")}. Check spelling before export.</p>}
        {chordRows.length ? chordRows.map((row, index) => <pre key={index} className="overflow-x-auto rounded bg-muted p-2 text-xs">{transposeChordRow(row, semitones)}</pre>) : <p className="text-muted-foreground">Add a chord row to preview transposition.</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button disabled={!onTranspose || saving || semitones === 0 || !chordRows.length || invalid.length > 0 || Math.abs(semitones) > 11}
          onClick={() => { if (!onTranspose) return; setSaving(true); setError(""); void onTranspose(scene.id, semitones).then(() => setSemitones(0)).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not transpose chords.")).finally(() => setSaving(false)) }}>
          {saving ? "Saving…" : "Apply transposition to chord rows"}
        </Button>
      </div> : <div className="grid gap-3 text-sm">
        <p>{metadata.form || "Free verse"}{metadata.meter ? ` · ${metadata.meter}` : ""} · {lines.length} {lines.length === 1 ? "line" : "lines"}</p>
        {metadata.targetLines && lines.length !== metadata.targetLines && <p role="status" className="text-amber-700 dark:text-amber-400">Target: {metadata.targetLines} lines; current: {lines.length}.</p>}
        {metadata.rhymeScheme && <p>Target rhyme scheme: {metadata.rhymeScheme}</p>}
        <p>Approximate ending pattern: {endingGroups.join(" ")}</p>
        <div className="max-h-64 overflow-y-auto rounded border bg-background p-2">
          {lines.map((line, index) => <div key={index} className="flex gap-3 bg-background py-0.5">
            <span className="w-6 text-right tabular-nums text-muted-foreground">{index + 1}</span>
            <span className="w-8 text-right tabular-nums" title={`Approximate syllable count; roughly ${Math.round(counts[index] / 2)} two-syllable feet`}>{counts[index]}σ</span>
            <span className="min-w-0 flex-1 truncate">{line || "(empty)"}</span>
            <span className="text-muted-foreground" title="Spelling-based ending group; compare rhyme by ear">{endingGroups[index]} · {rhymeEndings[index]}</span>
          </div>)}
        </div>
        {metadata.targetSyllables && counts.some((count) => count !== metadata.targetSyllables) && <p role="status" className="text-amber-700 dark:text-amber-400">Some lines differ from the {metadata.targetSyllables} syllable target.</p>}
        <p className="text-muted-foreground">Syllables, feet, and ending groups are rough guides. Read meter and rhyme aloud.</p>
      </div>}
    </DialogScrollContent>
  </Dialog>
}
