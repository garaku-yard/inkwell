"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2, UserRound, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  createCharacter,
  deleteCharacter,
  getProjectCharacters,
  updateCharacter,
  type Character,
  type Scene,
} from "@/services/project"

interface CharacterDraft {
  name: string
  role: string
  description: string
  traits: string
  motivation: string
  voice: string
  relationships: string
}

const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  role: "",
  description: "",
  traits: "",
  motivation: "",
  voice: "",
  relationships: "",
}

function draftFrom(character: Character): CharacterDraft {
  return {
    name: character.name,
    role: character.role,
    description: character.description,
    traits: character.attributes.traits ?? "",
    motivation: character.attributes.motivation ?? "",
    voice: character.attributes.voice ?? "",
    relationships: character.attributes.relationships ?? "",
  }
}

function attributesFrom(
  draft: CharacterDraft,
  current: Record<string, string> = {},
): Record<string, string> {
  const next = { ...current }
  for (const key of ["traits", "motivation", "voice", "relationships"] as const) {
    const value = draft[key].trim()
    if (value) next[key] = value
    else delete next[key]
  }
  return next
}

function mentionCount(name: string, passages: Scene[]): number {
  const needle = name.trim().toLocaleLowerCase()
  if (!needle) return 0
  return passages.filter((passage) =>
    (passage.elements ?? []).some((element) =>
      element.content.toLocaleLowerCase().includes(needle),
    ),
  ).length
}

interface CharacterManagerDialogProps {
  projectId: string
  userId?: string
  passages: Scene[]
}

export function CharacterManagerDialog({
  projectId,
  userId,
  passages,
}: CharacterManagerDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selected = useMemo(
    () => characters.find((character) => character.id === selectedId) ?? null,
    [characters, selectedId],
  )

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setLoading(true)
    void getProjectCharacters(projectId, userId)
      .then((items) => {
        if (cancelled) return
        setCharacters(items)
        if (items[0]) {
          setSelectedId(items[0].id)
          setDraft(draftFrom(items[0]))
        } else {
          setSelectedId(null)
          setDraft(EMPTY_DRAFT)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast({
            title: "Couldn’t load characters",
            description: error instanceof Error ? error.message : "Try again.",
            variant: "destructive",
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, toast, userId])

  const choose = (character: Character) => {
    setSelectedId(character.id)
    setDraft(draftFrom(character))
  }

  const startNew = () => {
    setSelectedId(null)
    setDraft(EMPTY_DRAFT)
  }

  const save = async () => {
    const name = draft.name.trim()
    if (!userId || !name) return
    setSaving(true)
    const input = {
      name,
      role: draft.role.trim(),
      description: draft.description.trim(),
      attributes: attributesFrom(draft, selected?.attributes),
    }
    try {
      const saved = selected
        ? await updateCharacter(selected.id, userId, input)
        : await createCharacter(projectId, userId, input)
      setCharacters((current) =>
        [...current.filter((character) => character.id !== saved.id), saved].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      )
      setSelectedId(saved.id)
      setDraft(draftFrom(saved))
      toast({ title: selected ? "Character updated" : "Character created" })
    } catch (error) {
      toast({
        title: "Couldn’t save character",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!selected || !userId) return
    if (!window.confirm(`Remove ${selected.name} from this project?`)) return
    try {
      await deleteCharacter(selected.id, userId)
      const next = characters.filter((character) => character.id !== selected.id)
      setCharacters(next)
      if (next[0]) choose(next[0])
      else startNew()
      toast({ title: "Character removed" })
    } catch (error) {
      toast({
        title: "Couldn’t remove character",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      })
    }
  }

  const field = (key: keyof CharacterDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <UsersRound className="h-3.5 w-3.5" />
          Characters
          {characters.length > 0 && (
            <span className="text-muted-foreground">{characters.length}</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Characters</DialogTitle>
          <DialogDescription>
            Keep identity, role, voice, and story relationships here. Changing gameplay state belongs in passage variables.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[15rem_1fr] overflow-hidden">
          <aside className="flex min-h-[34rem] flex-col border-r bg-muted/20 p-3">
            <Button variant="outline" size="sm" className="mb-3 justify-start gap-2" onClick={startNew}>
              <Plus className="h-3.5 w-3.5" /> New character
            </Button>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {loading && <p className="px-2 py-8 text-center text-xs text-muted-foreground">Loading…</p>}
              {!loading && characters.length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">No character profiles yet.</p>
              )}
              {characters.map((character) => {
                const mentions = mentionCount(character.name, passages)
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => choose(character)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left transition-colors",
                      selectedId === character.id ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{character.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[character.role, mentions ? `${mentions} passage${mentions === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "No role yet"}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="max-h-[34rem] space-y-4 overflow-y-auto px-6 py-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              {selected ? `Edit ${selected.name}` : "New character"}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="character-name">Name</Label>
                <Input id="character-name" value={draft.name} onChange={(event) => field("name", event.target.value)} placeholder="Mara Voss" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="character-role">Story role</Label>
                <Input id="character-role" value={draft.role} onChange={(event) => field("role", event.target.value)} placeholder="Protagonist, ally, rival…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="character-description">Who they are</Label>
              <Textarea id="character-description" value={draft.description} onChange={(event) => field("description", event.target.value)} placeholder="Background, personality, and the facts that stay true across the story." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="character-traits">Traits</Label>
                <Textarea id="character-traits" value={draft.traits} onChange={(event) => field("traits", event.target.value)} placeholder="Observant, guarded, dryly funny" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="character-motivation">Motivation</Label>
                <Textarea id="character-motivation" value={draft.motivation} onChange={(event) => field("motivation", event.target.value)} placeholder="What they want and why" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="character-voice">Voice</Label>
                <Textarea id="character-voice" value={draft.voice} onChange={(event) => field("voice", event.target.value)} placeholder="Cadence, vocabulary, verbal habits" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="character-relationships">Relationships</Label>
                <Textarea id="character-relationships" value={draft.relationships} onChange={(event) => field("relationships", event.target.value)} placeholder="Mara distrusts Ivo; owes Nia a favor" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {selected && (
            <Button variant="ghost" className="mr-auto gap-1.5 text-destructive hover:text-destructive" onClick={() => void remove()}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
          <Button onClick={() => void save()} disabled={!draft.name.trim() || !userId || saving}>
            {saving ? "Saving…" : selected ? "Save changes" : "Create character"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
