"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"
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
  const searchParams = useSearchParams()
  const projectId = searchParams.get("id") ?? ""
  const { project, isLoading, error } = useProjectLoader(projectId, user?.id, getFullProject)

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

  return <EditorFactory projectData={project} />
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ProjectPageContent />
    </Suspense>
  )
}
