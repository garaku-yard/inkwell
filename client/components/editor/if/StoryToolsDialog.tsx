"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Bug, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  diagnoseStory,
  parsePassageMetadata,
  type IFPassageMetadata,
  type IFStorySettings,
  type IFTestState,
  type IFValue,
  type IFVariableDefinition,
  type IFVariableType,
  type IFVariables,
} from "@/lib/interactive-fiction/runtime"
import type { Scene } from "@/services/project"

interface StoryToolsDialogProps {
  passages: Scene[]
  activePassageId: string | null
  runtimePassageId: string | null
  runtimeVariables: IFVariables
  settings: IFStorySettings
  onSave: (settings: IFStorySettings, passageId: string | null, metadata: IFPassageMetadata) => Promise<void>
  onSelectPassage: (passageId: string) => void
  onLoadTestState: (state: IFTestState) => void
}

function defaultValue(type: IFVariableType): IFValue {
  if (type === "number") return 0
  if (type === "boolean") return false
  return ""
}

function coerceValue(value: string, type: IFVariableType): IFValue {
  if (type === "number") return Number(value) || 0
  if (type === "boolean") return value === "true"
  return value
}

export function StoryToolsDialog({
  passages, activePassageId, runtimePassageId, runtimeVariables, settings,
  onSave, onSelectPassage, onLoadTestState,
}: StoryToolsDialogProps) {
  const [open, setOpen] = useState(false)
  const [variables, setVariables] = useState<IFVariableDefinition[]>(settings.variables)
  const [testStates, setTestStates] = useState<IFTestState[]>(settings.testStates)
  const [startPassageId, setStartPassageId] = useState(settings.startPassageId ?? passages[0]?.id ?? "")
  const active = passages.find((passage) => passage.id === activePassageId)
  const storedMetadata = parsePassageMetadata(active?.content)
  const [tags, setTags] = useState(storedMetadata.tags.join(", "))
  const [color, setColor] = useState(storedMetadata.color)
  const diagnostics = useMemo(
    () => diagnoseStory(passages, { startPassageId, variables, testStates }),
    [passages, startPassageId, testStates, variables],
  )

  const resetDraft = () => {
    setVariables(settings.variables)
    setTestStates(settings.testStates)
    setStartPassageId(settings.startPassageId ?? passages[0]?.id ?? "")
    const metadata = parsePassageMetadata(passages.find((passage) => passage.id === activePassageId)?.content)
    setTags(metadata.tags.join(", "))
    setColor(metadata.color)
  }

  const updateVariable = (index: number, patch: Partial<IFVariableDefinition>) => {
    setVariables((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const next = { ...item, ...patch }
      if (patch.type && patch.type !== item.type) next.initialValue = defaultValue(patch.type)
      return next
    }))
  }

  const saveTestState = () => {
    if (!runtimePassageId) return
    const name = `State ${testStates.length + 1}`
    setTestStates((current) => [...current, {
      id: crypto.randomUUID(), name, passageId: runtimePassageId, variables: { ...runtimeVariables },
    }])
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) resetDraft() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Story tools
          {diagnostics.length > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 text-amber-700 dark:text-amber-300">{diagnostics.length}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Story runtime and diagnostics</DialogTitle>
          <DialogDescription>
            Define initial state, tag the selected passage, save reproducible test states, and inspect logic problems.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <div>
            <Label>Start passage</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={startPassageId} onChange={(event) => setStartPassageId(event.target.value)}>
              {passages.map((passage) => <option key={passage.id} value={passage.id}>{passage.scene_heading || "Untitled"}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Variables</h3>
              <p className="text-xs text-muted-foreground">Initial values are applied before the Start passage runs.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setVariables((current) => [...current, { name: `variable_${current.length + 1}`, type: "boolean", initialValue: false }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Variable
            </Button>
          </div>
          {variables.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No declared variables yet. Set elements may still create variables during play.</p>}
          {variables.map((variable, index) => (
            <div key={`${index}-${variable.name}`} className="grid grid-cols-[1fr_8rem_1fr_auto] items-end gap-2">
              <div><Label className="text-xs">Name</Label><Input value={variable.name} onChange={(event) => updateVariable(index, { name: event.target.value.replace(/^\$/, "") })} /></div>
              <div>
                <Label className="text-xs">Type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={variable.type} onChange={(event) => updateVariable(index, { type: event.target.value as IFVariableType })}>
                  <option value="boolean">Boolean</option><option value="number">Number</option><option value="string">Text</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Initial value</Label>
                {variable.type === "boolean" ? (
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={String(variable.initialValue)} onChange={(event) => updateVariable(index, { initialValue: event.target.value === "true" })}>
                    <option value="false">false</option><option value="true">true</option>
                  </select>
                ) : <Input type={variable.type === "number" ? "number" : "text"} value={String(variable.initialValue)} onChange={(event) => updateVariable(index, { initialValue: coerceValue(event.target.value, variable.type) })} />}
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${variable.name}`} onClick={() => setVariables((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </section>

        <section className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div><Label>Selected passage tags</Label><Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="cave, chapter-one, ending" /></div>
          <div><Label>Passage color</Label><div className="flex gap-2"><Input type="color" className="w-14 px-1" value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#6b7280"} onChange={(event) => setColor(event.target.value)} /><Input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#6b7280" /></div></div>
        </section>

        <section className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Test states</h3><p className="text-xs text-muted-foreground">Capture the current passage entry state, then replay it exactly.</p></div><Button type="button" variant="outline" size="sm" disabled={!runtimePassageId} onClick={saveTestState}><Save className="mr-1 h-3.5 w-3.5" /> Capture play state</Button></div>
          {testStates.map((state, index) => <div key={state.id} className="flex items-center gap-2 rounded-md border px-3 py-2"><Input className="h-8" value={state.name} onChange={(event) => setTestStates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><span className="min-w-24 text-xs text-muted-foreground">{Object.keys(state.variables).length} variables</span><Button type="button" variant="ghost" size="sm" onClick={() => { onLoadTestState(state); setOpen(false) }}><Bug className="mr-1 h-3.5 w-3.5" /> Run</Button><Button type="button" variant="ghost" size="icon" onClick={() => setTestStates((current) => current.filter((item) => item.id !== state.id))}><Trash2 className="h-4 w-4" /></Button></div>)}
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Diagnostics ({diagnostics.length})</h3>
          {diagnostics.length === 0 ? <p className="text-xs text-muted-foreground">No structural or logic problems found.</p> : diagnostics.map((diagnostic, index) => (
            <button key={`${diagnostic.kind}-${diagnostic.passageId}-${diagnostic.elementId ?? index}`} className="block w-full rounded-md border px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => { onSelectPassage(diagnostic.passageId); setOpen(false) }}>
              <span className={diagnostic.severity === "error" ? "font-semibold text-destructive" : "font-semibold text-amber-700 dark:text-amber-300"}>{diagnostic.kind.replaceAll("-", " ")}</span>{" · "}{diagnostic.message}
            </button>
          ))}
        </section>

        <DialogFooter>
          <Button onClick={async () => {
            const nextSettings = { startPassageId, variables, testStates }
            await onSave(nextSettings, activePassageId, { tags: tags.split(","), color, story: activePassageId === passages[0]?.id ? nextSettings : storedMetadata.story })
            setOpen(false)
          }}>Save story settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
