"use client"

import { useState } from "react"
import type { NovelBlock } from "@/lib/editor/novel-blocks"

interface Props {
  id: string
  block: NovelBlock
  label?: string
  targets: { id: string; type: "chapter" | "figure"; label: string }[]
  onChange: (block: NovelBlock) => void
  onFocus: () => void
  onDelete: () => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

export function NovelBlockEditor({ id, block, label, targets, onChange, onFocus, onDelete, onMove, canMoveUp, canMoveDown }: Props) {
  const [editing, setEditing] = useState(false)
  const field = (name: string, value: string, change: (next: string) => void, multiline = false) =>
    <label className="grid gap-1 text-xs text-muted-foreground">{name}
      {multiline
        ? <textarea value={value} onChange={event => change(event.target.value)} rows={3} className="rounded border bg-background p-2 text-sm text-foreground" />
        : <input value={value} onChange={event => change(event.target.value)} className="rounded border bg-background p-2 text-sm text-foreground" />}
    </label>
  const imageControl = (image: string, change: (next: string) => void) => <div className="space-y-2">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image && <img src={image} alt="Block preview" className="max-h-72 max-w-full object-contain" />}
    <label className="inline-block cursor-pointer rounded border px-2 py-1 text-xs">{image ? "Change image" : "Upload image"}
      <input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={event => {
        const file = event.target.files?.[0]
        if (!file) return
        if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 750_000) { window.alert("Choose a JPG or PNG under 750 KB."); return }
        const reader = new FileReader()
        reader.onload = () => { if (typeof reader.result === "string") change(reader.result) }
        reader.readAsDataURL(file)
        event.target.value = ""
      }} />
    </label>
    {image && <button type="button" onClick={() => change("")} className="ml-2 text-xs underline">Remove image</button>}
  </div>

  const preview = (() => {
    switch (block.kind) {
      case "build_card": return <div className="border border-current/40 px-2 py-1 font-mono text-[0.72em] leading-snug">
        <div>Difficulty: {block.difficulty || "—"}</div><div>Time: {block.time || "—"}</div><div>Output: {block.output || "—"}</div>
      </div>
      case "callout": return <aside className="border-l-[3px] border-current/50 bg-foreground/5 px-2 py-1 text-[0.9em] leading-normal"><strong>{block.tone === "warning" ? "Warning" : "Aside"}</strong><div className="whitespace-pre-wrap">{block.body}</div></aside>
      case "figure": return <figure className="text-center">{block.image && <>{/* eslint-disable @next/next/no-img-element */}<img src={block.image} alt={block.alt || block.caption} className="mx-auto max-h-72 max-w-full object-contain" />{/* eslint-enable @next/next/no-img-element */}</>}<figcaption className="text-[0.85em]">{label ?? "Figure"}. {block.caption}</figcaption></figure>
      case "step": return <div><strong>{label ?? "Step"}{block.title ? `: ${block.title}` : ""}</strong><p className="whitespace-pre-wrap">{block.body}</p>{block.image && <>{/* eslint-disable @next/next/no-img-element */}<img src={block.image} alt={block.title} className="mx-auto max-h-72 max-w-full object-contain" />{/* eslint-enable @next/next/no-img-element */}</>}</div>
      case "materials": return <div><strong>Materials</strong><ul className="list-inside list-disc">{block.materials.split(/\r?\n/).filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ul><strong>Tools</strong><ul className="list-inside list-disc">{block.tools.split(/\r?\n/).filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ul></div>
      case "cross_reference": return <p>See {label ?? "Choose a chapter or figure"}.</p>
      case "glossary": return <div><strong>Glossary</strong>{block.entries.map((entry, i) => <div key={i}><b>{entry.term}</b> {entry.definition}</div>)}</div>
      case "index": return <div><strong>Index</strong>{block.entries.map((entry, i) => <div key={i}>{entry.term} — {targets.find(target => target.id === entry.targetId)?.label ?? "Missing reference"}</div>)}</div>
    }
  })()

  return <section id={`el-${id}`} tabIndex={-1} onFocus={onFocus} className={editing ? "my-3 space-y-3 rounded border border-border bg-background/70 p-3 text-sm" : "group relative my-2 text-inherit"}>
    {!editing && <div onClick={() => setEditing(true)} className="cursor-pointer" title="Click to edit block">{preview}</div>}
    {!editing && <button type="button" onClick={() => setEditing(true)} className="absolute right-0 top-0 rounded bg-background px-1 text-[11px] opacity-0 shadow group-hover:opacity-100 focus:opacity-100">Edit</button>}
    {editing && <>
    <div className="flex items-center justify-between gap-2">
      <strong>{label ?? ({ figure: "Figure", step: "Step", materials: "Materials and tools", callout: "Callout", build_card: "Build card", cross_reference: "Cross-reference", glossary: "Glossary", index: "Index" }[block.kind])}</strong>
      <div className="flex gap-2 text-xs">
        {block.kind === "step" && onMove && <><button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} className="disabled:opacity-40">Move up</button><button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} className="disabled:opacity-40">Move down</button></>}
        <button type="button" onClick={() => setEditing(false)}>Done</button>
        <button type="button" onClick={onDelete} className="text-destructive">Remove</button>
      </div>
    </div>
    {block.kind === "figure" && <>
      {imageControl(block.image, image => onChange({ ...block, image }))}
      {field("Caption", block.caption, caption => onChange({ ...block, caption }))}
      {field("Image description", block.alt, alt => onChange({ ...block, alt }))}
    </>}
    {block.kind === "step" && <>
      {field("Step title", block.title, title => onChange({ ...block, title }))}
      {field("Instructions", block.body, body => onChange({ ...block, body }), true)}
      {imageControl(block.image, image => onChange({ ...block, image }))}
    </>}
    {block.kind === "materials" && <>
      {field("Materials (one per line)", block.materials, materials => onChange({ ...block, materials }), true)}
      {field("Tools (one per line)", block.tools, tools => onChange({ ...block, tools }), true)}
    </>}
    {block.kind === "callout" && <>
      <label className="grid gap-1 text-xs text-muted-foreground">Kind<select value={block.tone} onChange={event => onChange({ ...block, tone: event.target.value as "warning" | "aside" })} className="rounded border bg-background p-2 text-sm text-foreground"><option value="warning">Warning</option><option value="aside">Aside</option></select></label>
      {field("Text", block.body, body => onChange({ ...block, body }), true)}
    </>}
    {block.kind === "build_card" && <div className="grid gap-2 sm:grid-cols-3">
      {field("Difficulty", block.difficulty, difficulty => onChange({ ...block, difficulty }))}
      {field("Time", block.time, time => onChange({ ...block, time }))}
      {field("Output", block.output, output => onChange({ ...block, output }))}
    </div>}
    {block.kind === "cross_reference" && <label className="grid gap-1 text-xs text-muted-foreground">Target
      <select value={`${block.targetType}:${block.targetId}`} onChange={event => {
        const target = targets.find(item => `${item.type}:${item.id}` === event.target.value)
        if (target) onChange({ ...block, targetType: target.type, targetId: target.id })
      }} className="rounded border bg-background p-2 text-sm text-foreground">
        <option value={`${block.targetType}:${block.targetId}`}>{label ?? "Choose a chapter or figure"}</option>
        {targets.map(target => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}
      </select>
    </label>}
    {block.kind === "glossary" && <div className="space-y-3">
      {block.entries.map((entry, entryIndex) => <div key={entryIndex} className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_2fr_auto]">
        {field("Term", entry.term, term => onChange({ ...block, entries: block.entries.map((item, index) => index === entryIndex ? { ...item, term } : item) }))}
        {field("Definition", entry.definition, definition => onChange({ ...block, entries: block.entries.map((item, index) => index === entryIndex ? { ...item, definition } : item) }), true)}
        <button type="button" onClick={() => onChange({ ...block, entries: block.entries.filter((_, index) => index !== entryIndex) })} className="text-xs text-destructive">Remove term</button>
      </div>)}
      <button type="button" onClick={() => onChange({ ...block, entries: [...block.entries, { term: "", definition: "" }] })} className="text-xs underline">Add term</button>
    </div>}
    {block.kind === "index" && <div className="space-y-3">
      {block.entries.map((entry, entryIndex) => <div key={entryIndex} className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_2fr_auto]">
        {field("Term", entry.term, term => onChange({ ...block, entries: block.entries.map((item, index) => index === entryIndex ? { ...item, term } : item) }))}
        <label className="grid gap-1 text-xs text-muted-foreground">Location
          <select value={`${entry.targetType}:${entry.targetId}`} onChange={event => {
            const target = targets.find(item => `${item.type}:${item.id}` === event.target.value)
            if (target) onChange({ ...block, entries: block.entries.map((item, index) => index === entryIndex ? { ...item, targetType: target.type, targetId: target.id } : item) })
          }} className="rounded border bg-background p-2 text-sm text-foreground">
            <option value={`${entry.targetType}:${entry.targetId}`}>{targets.find(target => target.id === entry.targetId && target.type === entry.targetType)?.label ?? "Choose a chapter or figure"}</option>
            {targets.map(target => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => onChange({ ...block, entries: block.entries.filter((_, index) => index !== entryIndex) })} className="text-xs text-destructive">Remove entry</button>
      </div>)}
      <button type="button" onClick={() => onChange({ ...block, entries: [...block.entries, { term: "", targetType: "chapter", targetId: "" }] })} className="text-xs underline">Add entry</button>
    </div>}
    </>}
  </section>
}
