"use client"

import { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export interface EditorCommand {
  id: string
  label: string
  group: string
  keywords?: string[]
  shortcut?: string
  run: () => void | Promise<void>
}

interface Props {
  commands: EditorCommand[]
}

/** A searchable, format-owned command list. Only mounted editors claim Mod+K. */
export function EditorCommandPalette({ commands }: Props) {
  const [open, setOpen] = useState(false)
  const priorFocus = useRef<HTMLElement | null>(null)
  const selected = useRef(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (!open && document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      if (!open) priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen((current) => !current)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  const grouped = new Map<string, EditorCommand[]>()
  for (const command of commands) grouped.set(command.group, [...(grouped.get(command.group) ?? []), command])

  const run = (command: EditorCommand) => {
    selected.current = true
    setOpen(false)
    // Let Radix finish closing before an insertion command focuses its new row.
    setTimeout(() => { void command.run() }, 0)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (next && !open) {
        priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        selected.current = false
      }
      setOpen(next)
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Editor commands" title="Editor commands (Ctrl/⌘ K)">
          <Search className="h-3.5 w-3.5" /> Commands
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0" onCloseAutoFocus={(event) => {
        event.preventDefault()
        if (!selected.current && priorFocus.current?.isConnected) priorFocus.current.focus()
        selected.current = false
      }}>
        <DialogTitle className="sr-only">Editor commands</DialogTitle>
        <DialogDescription className="sr-only">Search commands and press Enter to run one.</DialogDescription>
        <Command label="Search editor commands">
          <CommandInput aria-label="Search editor commands" placeholder="Search editor commands…" />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>
            {[...grouped].map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((command) => (
                  <CommandItem key={command.id} value={`${command.label} ${command.keywords?.join(" ") ?? ""}`} onSelect={() => run(command)}>
                    {command.label}
                    {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
