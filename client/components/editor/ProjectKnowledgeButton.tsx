"use client"

import { useState } from "react"
import { BookOpen } from "lucide-react"

import { getStorage } from "@/lib/storage"
import { Button } from "@/components/ui/button"

import { ProjectKnowledgeDialog } from "./ProjectKnowledgeDialog"

interface ProjectKnowledgeButtonProps {
  projectId?: string
  category?: string
}

/** Whether the bound storage build supports vault-as-knowledge. Defensive —
 *  `getStorage()` is always bound by the time an editor renders, but a thrown
 *  probe shouldn't take the header down. */
function knowledgeSupported(): boolean {
  try {
    return getStorage().capabilities.has("ai.knowledge")
  } catch {
    return false
  }
}

/**
 * Header affordance that opens the per-project Knowledge dialog. Renders
 * nothing for vault projects (they *are* the knowledge source), when no
 * project id is available, or on builds without the `ai.knowledge`
 * capability (web). Self-contained so both the shared `EditorHeader` and the
 * Screenplay editor's inline header can drop it in with no extra wiring.
 */
export function ProjectKnowledgeButton({
  projectId,
  category,
}: ProjectKnowledgeButtonProps) {
  const [open, setOpen] = useState(false)

  if (!projectId || category === "vault" || !knowledgeSupported()) return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Knowledge sources"
        title="Knowledge"
      >
        <BookOpen className="h-4 w-4" />
      </Button>
      <ProjectKnowledgeDialog
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
