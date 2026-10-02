"use client"

import { Input } from "@/components/ui/input"
import type { TtrpgBlock } from "@/lib/ttrpg/blocks"

interface Target { id: string; label: string }

export function TypedBlockEditor({ block, onChange, targets, onNavigate, currentProjectId, resolvedTargetLabel }: {
  block: TtrpgBlock
  onChange: (block: TtrpgBlock) => void
  targets: Target[]
  onNavigate: (id: string) => void
  currentProjectId: string
  resolvedTargetLabel?: string
}) {
  const field = (label: string, value: string, update: (value: string) => void, multiline = false) =>
    <label className="grid gap-1 text-sm">{label}
      {multiline ? <textarea className="min-h-20 rounded-md border bg-background px-3 py-2" value={value}
        onChange={(event) => update(event.target.value)} />
        : <Input value={value} onChange={(event) => update(event.target.value)} />}
    </label>

  if (block.kind === "clock") return <div className="space-y-3">
    {field("Clock", block.name, (name) => onChange({ ...block, name }))}
    <div className="flex flex-wrap gap-1" aria-label={`${block.filled} of ${block.segments} segments filled`}>
      {Array.from({ length: block.segments }, (_, index) => <button key={index} type="button"
        aria-label={`Set progress to ${index + 1}`} aria-pressed={index < block.filled}
        className={`h-8 w-8 rounded-full border-2 ${index < block.filled ? "bg-primary border-primary" : "border-muted-foreground/50"}`}
        onClick={() => onChange({ ...block, filled: index + 1 === block.filled ? index : index + 1 })} />)}
    </div>
    <div className="flex gap-3">
      <label className="grid gap-1 text-sm">Segments <Input className="w-24" type="number" min={1} max={24} value={block.segments}
        onChange={(event) => { const segments = Math.min(24, Math.max(1, Number(event.target.value) || 1)); onChange({ ...block, segments, filled: Math.min(block.filled, segments) }) }} /></label>
      <label className="grid gap-1 text-sm">Filled <Input className="w-24" type="number" min={0} max={block.segments} value={block.filled}
        onChange={(event) => onChange({ ...block, filled: Math.min(block.segments, Math.max(0, Number(event.target.value) || 0)) })} /></label>
    </div>
    {field("What advances this clock", block.note, (note) => onChange({ ...block, note }), true)}
  </div>
  if (block.kind === "read_aloud") return <div className="space-y-3">
    {field("Read aloud to players", block.text, (text) => onChange({ ...block, text }), true)}
    {field("GM guidance", block.gmNote, (gmNote) => onChange({ ...block, gmNote }), true)}
  </div>
  if (block.kind === "keyed_location") return <div className="space-y-3">
    <div className="flex gap-3">
      <div className="w-24">{field("Map key", block.key, (key) => onChange({ ...block, key }))}</div>
      <div className="flex-1">{field("Location", block.name, (name) => onChange({ ...block, name }))}</div>
    </div>
    {field("Description", block.description, (description) => onChange({ ...block, description }), true)}
    {field("Found here", block.contents, (contents) => onChange({ ...block, contents }), true)}
  </div>
  const remote = !!block.targetProjectId && block.targetProjectId !== currentProjectId
  const target = remote ? undefined : targets.find((item) => item.id === block.targetId)
  return <div className="space-y-2">
    {field("Target project ID (blank for this project)", block.targetProjectId ?? "", (targetProjectId) =>
      onChange({ ...block, targetProjectId, targetId: "", label: "" }))}
    {remote ? <>
      {field("Target passage or block ID", block.targetId, (targetId) => onChange({ ...block, targetId }))}
      {field("Link label", block.label, (label) => onChange({ ...block, label }))}
    </> : <label className="grid gap-1 text-sm">Linked passage or block
      <select className="h-9 rounded-md border bg-background px-2" value={block.targetId}
        onChange={(event) => {
          const next = targets.find((item) => item.id === event.target.value)
          onChange({ ...block, targetId: event.target.value, label: next?.label ?? block.label })
        }}>
        <option value="">Select a block…</option>
        {targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
    {block.targetId && (remote
      ? <a className="text-sm text-primary underline" href={`/projects/editor?id=${encodeURIComponent(block.targetProjectId!)}&target=${encodeURIComponent(block.targetId)}`}>See: {resolvedTargetLabel || block.label || block.targetId}</a>
      : target
      ? <button className="text-sm text-primary underline" onClick={() => onNavigate(block.targetId)}>See: {target.label}</button>
      : <p className="text-sm text-destructive">Linked block is missing (last known as {block.label || block.targetId}).</p>)}
  </div>
}
