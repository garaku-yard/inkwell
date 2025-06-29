"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Loader2, AlertCircle } from "lucide-react"
import { ScreenplayEditor } from "@/components/editor/ScreenplayEditor" // Your editor component
import { getProjectById, FullProject } from "@/services/project"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function ProjectPage() {
  const [project, setProject] = useState<FullProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The useParams hook gets the dynamic part of the URL, in this case, the [id].
  const params = useParams();
  const projectId = params.id as string; // The ID is a UUID string

  useEffect(() => {
    if (projectId) {
      const fetchProject = async () => {
        setIsLoading(true)
        setError(null)
        try {
          const fetchedProject = await getProjectById(projectId);
          setProject(fetchedProject);
        } catch (err) {
          setError("Could not load project. It may not exist or you may not have permission to view it.");
        } finally {
          setIsLoading(false)
        }
      }
      fetchProject()
    }
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Project</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!project) {
    return null; // Or a "Project not found" message
  }

  // Pass the fully-loaded project data to the editor component.
  return <ScreenplayEditor projectData={project} />;
}
