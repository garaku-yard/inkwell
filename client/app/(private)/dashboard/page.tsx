"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, Plus, Search, Users, Clock, Star, MoreHorizontal, User as UserIcon, LogOut, Loader2, AlertCircle, Inbox } from "lucide-react"

import { useAuth } from "@/lib/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { NewProjectDialog } from "./new-project-dialog"
import { getMyProjects, starProject, Project } from "@/services/project"
import { cn } from "@/lib/utils"

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  return date.toLocaleDateString();
}

export default function Dashboard() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()
  const { isAuthenticated, logout, userName } = useAuth()

  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      setIsLoading(true);
      const fetchProjects = async () => {
        try {
          const fetchedProjects = await getMyProjects()
          setProjects(fetchedProjects)
        } catch (err: any) {
          setError("Failed to fetch projects. Please try again later.")
        } finally {
          setIsLoading(false)
        }
      }
      fetchProjects()
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated])

  const handleProjectCreated = (newProject: Project) => {
    setProjects(prevProjects => [newProject, ...prevProjects]);
  };

  const handleStarProject = async (projectId: string, currentStatus: boolean) => {
    try {
      const updatedProject = await starProject(projectId, !currentStatus);
      setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
    } catch (error) {
      console.error("Failed to star project", error);
    }
  }

  const filteredProjects = projects.filter((project) =>
    project.projectName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleProjectClick = (projectId: string) => {
    router.push(`/project/${projectId}`)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            <h1 className="text-xl font-bold">Screenwriter</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <UserIcon className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{userName}</p>
                      <p className="text-xs leading-none text-muted-foreground">Welcome back!</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <Inbox className="mr-2 h-4 w-4" />
                    <span>Invites</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/login"><Button variant="outline" size="sm">Log In</Button></Link>
                <Link href="/register"><Button size="sm">Sign Up</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center py-6">
        <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold">My Projects</h2>
            <Button onClick={() => setIsNewProjectDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 w-full">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Tabs defaultValue="all" className="w-full sm:w-auto">
              <TabsList className="w-full">
                <TabsTrigger value="all" className="w-full sm:w-auto">All</TabsTrigger>
                <TabsTrigger value="starred" className="w-full sm:w-auto">Starred</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            <div className="text-center py-12 w-full flex justify-center items-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                {filteredProjects.map((project) => (
                  <Card
                    key={project.id}
                    className="overflow-hidden hover:shadow-xl hover:scale-105 transition-all duration-300 ease-in-out transform cursor-pointer flex flex-col"
                    onClick={() => handleProjectClick(project.id)}
                  >
                    <CardContent className="p-4 flex-grow">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg hover:text-primary">{project.projectName}</h3>
                          <p className="text-sm text-muted-foreground">{project.description}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Rename</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 pt-0 flex justify-between items-center text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        {formatRelativeTime(project.updatedAt)}
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStarProject(project.id, project.isStarred);
                          }}
                        >
                          <Star className={cn(
                            "h-4 w-4 text-muted-foreground hover:text-yellow-400",
                            project.isStarred && "fill-yellow-400 text-yellow-400"
                          )} />
                        </Button>
                        {project.collaboratorCount > 0 && (
                          <div className="flex items-center">
                            <Users className="h-3.5 w-3.5 mr-1" />
                            {/* The total number of people on the project is the owner (1) + collaborators */}
                            {project.collaboratorCount + 1}
                          </div>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              {filteredProjects.length === 0 && !isLoading && (
                <div className="text-center py-12 w-full">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-medium">No projects found</h3>
                  <p className="text-muted-foreground mt-2">
                    {searchQuery ? "Try a different search term" : "Create your first screenplay project to get started."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <NewProjectDialog
        open={isNewProjectDialogOpen}
        onOpenChange={setIsNewProjectDialogOpen}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  )
}
