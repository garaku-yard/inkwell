"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Users,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { AppHeader } from "@/components/AppHeader"
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher"
import { ProjectCard } from "@/components/ProjectCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { getSharedProjects, type Project } from "@/services/project"
import { toggleProjectStar } from "@/services/project"
import { toast } from "@/hooks/use-toast"

const CATEGORY_LABELS: Record<string, string> = {
  screenplay: "Screenplay",
  novel: "Novel",
  comic_script: "Comic Script",
  poetry: "Poetry",
  interactive_fiction: "Interactive Fiction",
  tabletop_rpg: "Tabletop RPG",
  memoir: "Memoir",
  lyrics: "Lyrics",
  board: "Board",
}


export default function SharedPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<string>("all")

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true)
      try {
        const data = await getSharedProjects()
        setProjects(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load shared projects")
      } finally {
        setIsLoading(false)
      }
    }
    fetch()
  }, [])

  // Build category list from actual shared projects
  const categories = useMemo(() => {
    const found = new Set(projects.map(p => p.category).filter(Boolean))
    return Array.from(found) as string[]
  }, [projects])

  const filteredProjects = useMemo(() => {
    let list = projects
    if (activeCategory !== "all") {
      list = list.filter(p => p.category === activeCategory)
    }
    if (searchQuery) {
      list = list.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    return list
  }, [projects, activeCategory, searchQuery])

  const handleStarProject = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user?.id) return
    try {
      const updated = await toggleProjectStar(projectId, user.id)
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, is_starred: updated.is_starred } : p))
      toast({
        title: updated.is_starred ? "Project starred" : "Star removed",
        description: updated.is_starred ? "Added to starred" : "Removed from starred",
      })
    } catch {
      toast({ title: "Error", description: "Could not update project.", variant: "destructive" })
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <WorkspaceSwitcher />

        <main className="flex-grow flex flex-col py-6 overflow-y-auto">
          <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto">

            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-muted-foreground" />
                <h2 className="text-3xl font-bold">Shared with me</h2>
              </div>
            </div>

            {/* Search + category filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search shared projects..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Category pills */}
              {categories.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setActiveCategory("all")}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                      activeCategory === "all"
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    All
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                        activeCategory === cat
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {CATEGORY_LABELS[cat] ?? cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-medium">No shared projects</h3>
                <p className="text-muted-foreground mt-2">
                  {projects.length === 0
                    ? "Projects shared with you will appear here."
                    : "No projects match the selected filter."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    userId={user?.id ?? ""}
                    onStar={handleStarProject}
                    onManageCollaborators={() => {}}
                    onDelete={() => {}}
                    onRename={() => {}}
                    onClick={(id) => router.push(`/projects/editor?id=${id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
