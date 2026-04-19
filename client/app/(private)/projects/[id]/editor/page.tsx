"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Loader2, AlertCircle } from "lucide-react"
import { EditorFactory } from "@/components/editor/EditorFactory"
import { getFullProject, FullProject } from "@/services/project"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAuth } from "@/lib/AuthContext"
import { setWindowTitle } from "@/lib/desktop"

export default function ProjectPage() {
  const { user } = useAuth()
  const [project, setProject] = useState<FullProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const params = useParams();
  const projectId = params.id as string;

  useEffect(() => {
    if (projectId && user?.id) {
      const fetchProject = async () => {
        setIsLoading(true)
        setError(null)
        try {
          const fetchedProject = await getFullProject(projectId, user.id);
          setProject(fetchedProject);
        } catch (err) {
          console.error('Error fetching project:', err)
          setError("Could not load project. It may not exist or you may not have permission to view it.");
        } finally {
          setIsLoading(false)
        }
      }
      fetchProject()
    } else if (projectId && !user?.id) {
      setIsLoading(false)
      setError("Authentication required. Please log in again.")
    }
  }, [projectId, user?.id]);

  // Mirror the project title into the native window chrome (desktop only;
  // no-op in the web build). Restored to plain "Inkwell" on unmount.
  useEffect(() => {
    if (project?.title) void setWindowTitle(`Inkwell — ${project.title}`)
    return () => {
      void setWindowTitle("Inkwell")
    }
  }, [project?.title])

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
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
    return null;
  }

  return <EditorFactory projectData={project} />;
}
