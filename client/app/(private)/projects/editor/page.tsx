"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { EditorFactory } from "@/components/editor/EditorFactory"
import { getFullProject } from "@/services/project"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAuth } from "@/lib/AuthContext"
import { setWindowTitle } from "@/lib/desktop"
import { PaneSpinner } from "@/components/shared/PaneSpinner"
import { FullPageSpinner } from "@/components/shared/FullPageSpinner"
import { useProjectLoader } from "@/hooks/useProjectLoader"

function ProjectPageContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get("id") ?? ""
  const { project, isLoading, error } = useProjectLoader(projectId, user?.id, getFullProject)

  // A board has no format editor — its home is the beat-board canvas. The
  // dashboard and new-project flows already route board projects there, but a
  // stray link to the editor route would otherwise fall through EditorFactory's
  // default and render a screenplay editor, so bounce it to the canvas.
  const isBoard = project?.category === "board"
  useEffect(() => {
    if (isBoard) router.replace(`/projects/beat-board?id=${projectId}`)
  }, [isBoard, projectId, router])

  // Mirror the project title into the native window chrome (desktop only;
  // no-op in the web build). Restored to plain "Inkwell" on unmount.
  useEffect(() => {
    if (project?.title) void setWindowTitle(`Inkwell — ${project.title}`)
    return () => {
      void setWindowTitle("Inkwell")
    }
  }, [project?.title])

  if (isLoading) {
    return <PaneSpinner />
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Project</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!project) {
    return null
  }

  // Redirecting to the beat-board canvas (effect above) — don't flash the
  // fallback screenplay editor in the meantime.
  if (isBoard) {
    return <PaneSpinner />
  }

  return <EditorFactory projectData={project} />
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ProjectPageContent />
    </Suspense>
  )
}
