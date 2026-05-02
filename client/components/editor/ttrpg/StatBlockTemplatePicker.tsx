"use client"

/**
 * Modal that lets a writer drop a system-specific stat-block skeleton
 * into the active stat_block element. Triggered from the element
 * header's "Load template" button. Picks are click-to-confirm — the
 * editor overwrites the element content immediately and closes the
 * dialog so the writer lands back on the page ready to fill in names.
 */

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { STAT_BLOCK_TEMPLATES } from "./stat-block-templates"

interface StatBlockTemplatePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (body: string) => void
}

export function StatBlockTemplatePicker({ open, onOpenChange, onPick }: StatBlockTemplatePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load stat-block template</DialogTitle>
          <DialogDescription>
            Replaces the current stat-block content with a starter for the chosen system. Existing text is overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 mt-2">
          {STAT_BLOCK_TEMPLATES.map((tpl) => (
            <Button
              key={tpl.id}
              variant="outline"
              className="h-auto justify-start gap-3 px-4 py-3 text-left"
              onClick={() => {
                onPick(tpl.body)
                onOpenChange(false)
              }}
            >
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight">{tpl.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 whitespace-normal">
                  {tpl.description}
                </p>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
