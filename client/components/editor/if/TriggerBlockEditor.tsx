"use client"

import { Plus, Trash2, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  defaultTriggerBlock,
  eventNameFromLabel,
  parseTriggerBlock,
  serializeTriggerBlock,
  type IFTriggerActionKind,
  type IFTriggerBlock,
} from "@/lib/interactive-fiction/runtime"

interface TriggerBlockEditorProps {
  id: string
  value: string
  onValueChange: (value: string) => void
}

function readTrigger(value: string): IFTriggerBlock {
  try {
    return parseTriggerBlock(value)
  } catch {
    return defaultTriggerBlock()
  }
}

const actionPlaceholder: Record<IFTriggerActionKind, string> = {
  reveal: "Writing revealed when this event fires…",
  set: "{set $variable to value}",
  conditional: "{if $flag: Text or [[Choice -> Passage]] else: Other text}",
}

/** Structured authoring surface for one executable Interactive Fiction event. */
export function TriggerBlockEditor({ id, value, onValueChange }: TriggerBlockEditorProps) {
  const trigger = readTrigger(value)
  const update = (patch: Partial<IFTriggerBlock>) => onValueChange(serializeTriggerBlock({ ...trigger, ...patch }))
  const updateAction = (index: number, patch: Partial<IFTriggerBlock["actions"][number]>) => update({
    actions: trigger.actions.map((action, actionIndex) => actionIndex === index ? { ...action, ...patch } : action),
  })
  const addAction = (kind: IFTriggerActionKind) => update({
    actions: [...trigger.actions, { id: crypto.randomUUID(), kind, content: actionPlaceholder[kind] }],
  })

  return (
    <div id={id} className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
          <Zap className="h-3.5 w-3.5" /> Executable trigger
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={trigger.once} onChange={(event) => update({ once: event.target.checked })} /> Fire once
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Trigger label"
          value={trigger.label}
          placeholder="Run start"
          onChange={(event) => {
            const label = event.target.value
            update({ label, event: trigger.event === eventNameFromLabel(trigger.label) ? eventNameFromLabel(label) : trigger.event })
          }}
        />
        <Input
          aria-label="Trigger event name"
          value={trigger.event}
          className="font-mono"
          placeholder="run_start"
          onChange={(event) => update({ event: event.target.value })}
        />
      </div>
      <Textarea
        aria-label="Trigger author note"
        value={trigger.note}
        className="mt-2 min-h-16 text-xs"
        placeholder="When this event should fire, implementation handoff, or timing notes…"
        onChange={(event) => update({ note: event.target.value })}
      />
      <div className="mt-3 space-y-2">
        {trigger.actions.map((action, index) => (
          <div key={action.id} className="rounded-md border bg-background/70 p-2">
            <div className="mb-2 flex items-center gap-2">
              <span className="w-5 text-right font-mono text-xs text-muted-foreground">{index + 1}</span>
              <select
                aria-label={`Trigger action ${index + 1} type`}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={action.kind}
                onChange={(event) => updateAction(index, { kind: event.target.value as IFTriggerActionKind })}
              >
                <option value="reveal">Reveal writing</option>
                <option value="set">Set variable</option>
                <option value="conditional">Conditional</option>
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7"
                aria-label={`Delete trigger action ${index + 1}`}
                disabled={trigger.actions.length === 1}
                onClick={() => update({ actions: trigger.actions.filter((_, actionIndex) => actionIndex !== index) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              aria-label={`Trigger action ${index + 1}`}
              value={action.content}
              className={action.kind === "reveal" ? "min-h-20" : "min-h-16 font-mono text-xs"}
              placeholder={actionPlaceholder[action.kind]}
              onChange={(event) => updateAction(index, { content: event.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addAction("reveal")}><Plus className="mr-1 h-3 w-3" /> Writing</Button>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addAction("set")}><Plus className="mr-1 h-3 w-3" /> Variable</Button>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addAction("conditional")}><Plus className="mr-1 h-3 w-3" /> Condition</Button>
      </div>
    </div>
  )
}
