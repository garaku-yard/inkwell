"use client"

/**
 * Global keyboard-shortcuts cheat sheet, opened with `?` from anywhere
 * inside the private routes.
 *
 * Per CLAUDE.md the editor formats each own a `keymap.ts` config file
 * (screenplay/keymap.ts etc.) — those are the source of truth for
 * which shortcuts are wired. This dialog mirrors them in plain
 * English so writers can discover bindings without grepping the
 * codebase. Keep the labels here in sync when you change a keymap
 * config; there's no auto-generation path because the bindings carry
 * editor-specific element vocabulary the manifest can't infer.
 */

import { useEffect, useState } from "react"
import { Keyboard } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ShortcutEntry {
  /** Key combo as the user would press it. Use "Mod" for the
   *  cross-platform Cmd-on-mac / Ctrl-elsewhere modifier. */
  keys: string
  description: string
}

interface ShortcutSection {
  title: string
  description?: string
  entries: ShortcutEntry[]
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Global",
    entries: [
      { keys: "?", description: "Show this shortcut sheet" },
      { keys: "Esc", description: "Close any dialog or popover" },
    ],
  },
  {
    title: "Every editor",
    description: "Works in every format-specific editor.",
    entries: [
      { keys: "Mod + S", description: "Force-save the current draft" },
      { keys: "Tab", description: "Cycle to the next element type" },
      { keys: "Shift + Tab", description: "Cycle to the previous element type" },
      { keys: "↑ / ↓", description: "Jump caret to the previous / next element" },
      { keys: "Backspace (on empty line)", description: "Delete the current element + focus the previous one" },
    ],
  },
  {
    title: "Screenplay",
    description: "Industry shortcuts for action / character / dialogue / etc.",
    entries: [
      { keys: "Mod + 1", description: "Action" },
      { keys: "Mod + 2", description: "Character cue" },
      { keys: "Mod + 3", description: "Dialogue" },
      { keys: "Mod + 4", description: "Parenthetical" },
      { keys: "Mod + 5", description: "Transition" },
      { keys: "Mod + 6", description: "Shot" },
      { keys: "Double-Enter", description: "Start a new scene heading" },
    ],
  },
  {
    title: "Prose / Memoir",
    entries: [
      { keys: "Mod + 1", description: "Paragraph" },
      { keys: "Mod + 2", description: "Section heading" },
      { keys: "Mod + 3", description: "Scene break (* * *)" },
      { keys: "Mod + 4", description: "Dialogue paragraph" },
      { keys: "Mod + 5", description: "Stinger / scene-heading transition" },
      { keys: "Double-Enter", description: "Start a new chapter" },
    ],
  },
  {
    title: "Poetry / Lyrics",
    entries: [
      { keys: "Shift + Mod + 1", description: "Stanza break" },
      { keys: "Shift + Mod + 2", description: "Section label (lyrics: Verse / Chorus / Bridge)" },
      { keys: "Shift + Mod + 3", description: "Chord row above the next line (lyrics)" },
    ],
  },
  {
    title: "Comic Script",
    entries: [
      { keys: "Mod + 1", description: "Panel description" },
      { keys: "Mod + 2", description: "Character cue" },
      { keys: "Mod + 3", description: "Speech balloon" },
      { keys: "Mod + 4", description: "Caption" },
      { keys: "Mod + 5", description: "SFX" },
      { keys: "Mod + 6", description: "Transition" },
      { keys: "Mod + ← / →", description: "Jump to previous / next panel across pages" },
    ],
  },
  {
    title: "Tabletop RPG",
    entries: [
      { keys: "Mod + 1", description: "Body / lore paragraph" },
      { keys: "Mod + 2", description: "Subsection heading (h2)" },
      { keys: "Mod + 3", description: "Stat block" },
      { keys: "Mod + 4", description: "Dice table" },
      { keys: "Mod + 5", description: "Pipe table" },
      { keys: "Mod + 6", description: "Designer note (callout)" },
      { keys: "Mod + 7", description: "Rule box" },
      { keys: "/", description: "Slash menu (insert any element by name)" },
    ],
  },
  {
    title: "Interactive Fiction",
    entries: [
      { keys: "Mod + 1", description: "Body text" },
      { keys: "Mod + 2", description: "Choice link" },
      { keys: "Mod + 3", description: "Conditional block" },
      { keys: "Mod + 4", description: "Variable set" },
      { keys: "Mod + 5", description: "Author note" },
      { keys: "Tab", description: "Body ↔ choice toggle" },
      { keys: "[[", description: "Open passage autocomplete" },
    ],
  },
  {
    title: "Vault (markdown)",
    description: "CodeMirror-flavoured Obsidian-style markdown.",
    entries: [
      { keys: "Mod + B", description: "Bold the selection" },
      { keys: "Mod + I", description: "Italicise the selection" },
      { keys: "Mod + Z / Mod + Shift + Z", description: "Undo / redo" },
      { keys: "Click a [[wikilink]]", description: "Jump to the target note (creates it if missing)" },
      { keys: "Click a #tag", description: "Filter the sidebar to notes carrying that tag" },
    ],
  },
]

/** Watches for the `?` key (when not typing) and toggles the sheet. */
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack "?" while the user is typing into a field — that
      // would make the question-mark character impossible to write.
      const target = e.target as HTMLElement | null
      const isTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      if (isTextInput) return
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Mod is Cmd on macOS, Ctrl on Windows + Linux. Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">?</kbd> anywhere outside a text field to reopen this sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {section.title}
              </h3>
              {section.description && (
                <p className="text-xs text-muted-foreground mb-3">{section.description}</p>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {section.entries.map((entry) => (
                  <div key={entry.keys} className="contents">
                    <dt className="font-mono text-xs text-foreground bg-muted/60 rounded px-2 py-0.5 self-center min-w-[10ch]">
                      {entry.keys}
                    </dt>
                    <dd className="text-muted-foreground self-center">
                      {entry.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
