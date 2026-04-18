"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/AuthContext"
import { getFullProject, type FullProject } from "@/services/project"
import { computeAnalytics, type ScriptAnalytics } from "@/lib/analytics"

/** Loads a project and computes its screenplay analytics (word count, scene breakdown, etc.). */
export function useProjectAnalytics() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const projectId = searchParams.get("project") ?? ""

  const [project, setProject] = useState<FullProject | null>(null)
  const [analytics, setAnalytics] = useState<ScriptAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !user?.id) return
    setIsLoading(true)
    setError(null)
    getFullProject(projectId, user.id)
      .then(p => {
        setProject(p)
        setAnalytics(computeAnalytics(p))
      })
      .catch(err => {
        console.error(err)
        setError("Failed to load project data")
      })
      .finally(() => setIsLoading(false))
  }, [projectId, user?.id])

  return { projectId, project, analytics, isLoading, error }
}
