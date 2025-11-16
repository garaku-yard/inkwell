"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import Image from 'next/image';
import { useRouter } from "next/navigation"
import {
  FileText,
  Plus,
  Search,
  Users,
  Clock,
  Star,
  MoreHorizontal,
  UserIcon,
  LogOut,
  Loader2,
  AlertCircle,
  Inbox,
  UserPlus,
  ArrowDownUp,
  Folder,
  Briefcase,
  FilePlus2Icon
} from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { NewProjectDialog } from "./new-project-dialog"
import { CollaboratorsDialog } from "./collaborators-dialog"
import { DeleteProjectDialog } from "@/components/delete-project-dialog"
import { RenameProjectDialog } from "@/components/rename-project-dialog"
import { getPendingInvites } from "@/services/invites"
import { deleteProject, getMyProjects, starProject, updateProject, type Project } from "@/services/project"
import { cn } from "@/lib/utils"

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return "Just now"
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  return date.toLocaleDateString()
}

export default function DashboardPage() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false)
  const [collaboratorsDialog, setCollaboratorsDialog] = useState<{
    open: boolean
    projectId: string
    projectName: string
  }>({
    open: false,
    projectId: "",
    projectName: "",
  })
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    projectId: string
    projectName: string
  }>({
    open: false,
    projectId: "",
    projectName: "",
  })
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()
  const { isAuthenticated, logout, userName, fullName, userId } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    projectId: string
    projectName: string
    projectDescription: string
  }>({
    open: false,
    projectId: "",
    projectName: "",
    projectDescription: "",
  })
  const [isRenaming, setIsRenaming] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteCount, setInviteCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState("lastUpdated")

  useEffect(() => {
    if (isAuthenticated) {
      setIsLoading(true)
      const fetchDashboardData = async () => {
        try {
          const [fetchedProjects, fetchedInvites] = await Promise.all([
            getMyProjects(),
            getPendingInvites(),
          ])
          setProjects(fetchedProjects)
          setInviteCount(fetchedInvites.length)
        } catch (err: any) {
          setError("Failed to fetch dashboard data. Please try again later.")
        } finally {
          setIsLoading(false)
        }
      }
      fetchDashboardData()
    } else {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prevProjects) => [newProject, ...prevProjects])
  }

  const handleStarProject = async (projectId: string, currentStatus: boolean) => {
    const originalProjects = [...projects]
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, isStarred: !currentStatus } : p)),
    )

    try {
      const updatedProject = await starProject(projectId, !currentStatus)
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updatedProject : p)))
    } catch (error) {
      console.error("Failed to star project", error)
      setProjects(originalProjects)
      toast({
        title: "Error",
        description: "Failed to update project. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleManageCollaborators = (projectId: string, projectName: string) => {
    setCollaboratorsDialog({
      open: true,
      projectId,
      projectName,
    })
  }

  const handleDeleteProjectClick = (projectId: string, projectName: string) => {
    setDeleteDialog({
      open: true,
      projectId,
      projectName,
    })
  }

  const handleDeleteProject = async () => {
    if (!deleteDialog.projectId) return

    setIsDeleting(true)
    try {
      await deleteProject(deleteDialog.projectId)
      setProjects((prev) => prev.filter((p) => p.id !== deleteDialog.projectId))
      setDeleteDialog({ open: false, projectId: "", projectName: "" })
      toast({
        title: "Project deleted",
        description: `"${deleteDialog.projectName}" has been permanently deleted.`,
      })
    } catch (error) {
      console.error("Failed to delete project", error)
      toast({
        title: "Error",
        description: "Could not delete project. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRenameProjectClick = (projectId: string, projectName: string, projectDescription: string) => {
    setRenameDialog({
      open: true,
      projectId,
      projectName,
      projectDescription,
    })
  }

  const handleRenameProject = async (newName: string, newDescription: string) => {
    if (!renameDialog.projectId) return

    setIsRenaming(true)
    try {
      const updatedData = await updateProject(renameDialog.projectId, {
        projectName: newName,
        description: newDescription,
      })
      setProjects((prev) => prev.map((p) => (p.id === renameDialog.projectId ? updatedData : p)))
      setRenameDialog({ open: false, projectId: "", projectName: "", projectDescription: "" })
      toast({
        title: "Project updated",
        description: `"${newName}" has been successfully updated.`,
      })
    } catch (error) {
      console.error("Failed to rename project", error)
      toast({
        title: "Error",
        description: "Could not update project. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsRenaming(false)
    }
  }

  const filteredProjects = useMemo(() => {
    let processedProjects = [...projects]

    switch (activeFilter) {
      case "lastUpdated":
        processedProjects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        break
      case "myProjects":
        processedProjects = projects.filter((p) => p.userId === userId)
        break
      case "collaborations":
        processedProjects = projects.filter((p) => p.userId !== userId)
        break
      case "starred":
        processedProjects = projects.filter((p) => p.isStarred)
        break
      default:
        break
    }

    if (!searchQuery) {
      return processedProjects
    }

    return processedProjects.filter((project) =>
      project.projectName.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }, [projects, activeFilter, searchQuery, userId])

  const handleProjectClick = (projectId: string) => {
    router.push(`/projects/${projectId}/editor`)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Image
              src="/scriptalith.png"
              alt="Scriptlith Logo"
              width={40}
              height={40}
            />
            <h1 className="text-xl font-bold">Scriptlith</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <UserIcon className="h-5 w-5" />
                    {inviteCount > 0 && (
                      <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-white" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{fullName}</p>
                      <p className="text-xs leading-none text-muted-foreground">{userName}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/invites" passHref>
                    <DropdownMenuItem>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center">
                          <Inbox className="mr-2 h-4 w-4" />
                          <span>Inbox</span>
                        </div>
                        {inviteCount > 0 && (
                          <Badge className="h-5 bg-teal-100 text-teal-800 dark:bg-teal-800 dark:text-teal-100">
                            {inviteCount}
                          </Badge>
                        )}
                      </div>
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="outline" size="sm">
                    Log In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center py-6">
        <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold">My Projects</h2>

            <div className="flex items-center gap-2">
              <Button onClick={() => setIsNewProjectDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Button>
              <Button>
                <FilePlus2Icon className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
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

            <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full sm:w-auto">
              <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4">
                <TabsTrigger value="lastUpdated" className="w-full sm:w-auto gap-1">
                  <ArrowDownUp className="h-4 w-4" />
                  Recent
                </TabsTrigger>
                <TabsTrigger value="myProjects" className="w-full sm:w-auto gap-1">
                  <Folder className="h-4 w-4" />
                  My Projects
                </TabsTrigger>
                <TabsTrigger value="collaborations" className="w-full sm:w-auto gap-1">
                  <Briefcase className="h-4 w-4" />
                  Collaborations
                </TabsTrigger>
                <TabsTrigger value="starred" className="w-full sm:w-auto gap-1">
                  <Star className="h-4 w-4" />
                  Starred
                </TabsTrigger>
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
              {/* Projects Grid */}
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleManageCollaborators(project.id, project.projectName)
                              }}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              Manage Collaborators
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRenameProjectClick(project.id, project.projectName, project.description || "")
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteProjectClick(project.id, project.projectName)
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              Delete
                            </DropdownMenuItem>
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
                        {/* Quick Add Collaborator Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleManageCollaborators(project.id, project.projectName)
                          }}
                          title="Add Collaborator"
                        >
                          <UserPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStarProject(project.id, project.isStarred)
                          }}
                        >
                          <Star
                            className={cn(
                              "h-4 w-4 text-muted-foreground hover:text-yellow-400",
                              project.isStarred && "fill-yellow-400 text-yellow-400",
                            )}
                          />
                        </Button>

                        {project.collaboratorCount > 0 && (
                          <div className="flex items-center">
                            <Users className="h-3.5 w-3.5 mr-1" />
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
                    {searchQuery
                      ? "Try a different search term"
                      : "Create your first screenplay project to get started."}
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

      <CollaboratorsDialog
        open={collaboratorsDialog.open}
        onOpenChange={(open) => setCollaboratorsDialog((prev) => ({ ...prev, open }))}
        projectId={collaboratorsDialog.projectId}
        projectName={collaboratorsDialog.projectName}
      />

      <DeleteProjectDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
        onConfirm={handleDeleteProject}
        projectName={deleteDialog.projectName}
        isDeleting={isDeleting}
      />

      <RenameProjectDialog
        open={renameDialog?.open ?? false}
        onOpenChange={(open) => setRenameDialog((prev) => ({ ...prev, open }))}
        onConfirm={handleRenameProject}
        projectName={renameDialog?.projectName ?? ""}
        projectDescription={renameDialog?.projectDescription ?? ""}
        isRenaming={isRenaming}
      />
    </div>
  )
}
