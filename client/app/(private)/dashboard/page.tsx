"use client"

import { useState } from "react"
import {
  FileText,
  Plus,
  Search,
  Star,
  Loader2,
  AlertCircle,
  ArrowDownUp,
  Folder,
  Briefcase,
  FilePlus2Icon,
} from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { useProjects } from "@/hooks/useProjects"
import { AppHeader } from "@/components/AppHeader"
import { ProjectCard } from "@/components/ProjectCard"
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { NewProjectDialog } from "./new-project-dialog"
import { CollaboratorsDialog } from "./collaborators-dialog"
import { FdxImportDialog } from "./fdx-import-dialog"
import { DeleteProjectDialog } from "@/components/delete-project-dialog"
import { RenameProjectDialog } from "@/components/rename-project-dialog"
import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { isTauri } from "@tauri-apps/api/core"

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()
  const { needsOnboarding, activeWorkspace } = useWorkspace()
  const userId = user?.id

  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("lastUpdated")

  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false)
  const [collaboratorsDialog, setCollaboratorsDialog] = useState({
    open: false,
    projectId: "",
    projectName: "",
  })
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    projectId: "",
    projectName: "",
  })
  const [renameDialog, setRenameDialog] = useState({
    open: false,
    projectId: "",
    projectName: "",
    projectDescription: "",
  })
  const [importPath, setImportPath] = useState<string | null>(null)

  const {
    filteredProjects,
    isLoading,
    isDeleting,
    isRenaming,
    error,
    inviteCount,
    handleProjectCreated,
    handleStarProject,
    handleDeleteProject,
    handleRenameProject,
    handleProjectClick,
  } = useProjects({ userId, isAuthenticated, authLoading, activeFilter, searchQuery, activeWorkspace })

  useEffect(() => {
    if (!authLoading && isAuthenticated && needsOnboarding) {
      router.replace("/onboarding")
    }
  }, [authLoading, isAuthenticated, needsOnboarding, router])

  // File → New Project (native menu) lands here with ?new=1. Open the
  // existing dialog and strip the flag so a refresh doesn't reopen it.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setIsNewProjectDialogOpen(true)
      const url = new URL(window.location.href)
      url.searchParams.delete("new")
      router.replace(url.pathname + (url.search ? url.search : ""))
    }
  }, [searchParams, router])

  // OS file-association → Inkwell. The Rust side stashes the path
  // either at launch (CLI arg on Windows/Linux) or via RunEvent::Opened
  // (macOS), and re-emits a live `open-file` event for already-running
  // instances. We drain the slot once on mount and then keep listening.
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      const { listen } = await import("@tauri-apps/api/event")
      const { invoke } = await import("@tauri-apps/api/core")
      unlisten = await listen<string>("open-file", (e) => {
        setImportPath(e.payload)
      })
      const initial = await invoke<string | null>("consume_pending_open_file")
      if (!cancelled && initial) setImportPath(initial)
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const handleImportClick = async () => {
    if (!isTauri()) return
    const { open } = await import("@tauri-apps/plugin-dialog")
    const picked = await open({
      multiple: false,
      filters: [{ name: "Final Draft", extensions: ["fdx"] }],
    })
    if (typeof picked === "string") setImportPath(picked)
  }

  const handleManageCollaborators = (projectId: string, projectTitle: string) => {
    setCollaboratorsDialog({ open: true, projectId, projectName: projectTitle })
  }

  const handleDeleteClick = (projectId: string, projectTitle: string) => {
    setDeleteDialog({ open: true, projectId, projectName: projectTitle })
  }

  const handleRenameClick = (projectId: string, projectTitle: string, projectDescription: string) => {
    setRenameDialog({ open: true, projectId, projectName: projectTitle, projectDescription })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <AppHeader inviteCount={inviteCount} />

      <div className="flex flex-1 overflow-hidden">
        <WorkspaceSwitcher />

        <main className="flex-grow flex flex-col items-center py-6 overflow-y-auto">
          <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold">My Projects</h2>
              <div className="flex items-center gap-2">
                <Button onClick={() => setIsNewProjectDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Project
                </Button>
                <Button onClick={handleImportClick} disabled={!isTauri()}>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      userId={userId ?? ""}
                      onStar={handleStarProject}
                      onManageCollaborators={handleManageCollaborators}
                      onDelete={handleDeleteClick}
                      onRename={handleRenameClick}
                      onClick={handleProjectClick}
                    />
                  ))}
                </div>

                {filteredProjects.length === 0 && (
                  <div className="text-center py-12 w-full">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-medium">No projects found</h3>
                    <p className="text-muted-foreground mt-2">
                      {searchQuery
                        ? "Try a different search term"
                        : `No ${activeWorkspace?.name ?? "projects"} yet. Create your first project to get started.`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

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
        onConfirm={() => {
          handleDeleteProject(deleteDialog.projectId, deleteDialog.projectName).then(() => {
            setDeleteDialog({ open: false, projectId: "", projectName: "" })
          })
        }}
        projectName={deleteDialog.projectName}
        isDeleting={isDeleting}
      />

      <FdxImportDialog
        filePath={importPath}
        onCancel={() => setImportPath(null)}
      />

      <RenameProjectDialog
        open={renameDialog.open}
        onOpenChange={(open) => setRenameDialog((prev) => ({ ...prev, open }))}
        onConfirm={(newName, newDescription) => {
          handleRenameProject(renameDialog.projectId, newName, newDescription).then(() => {
            setRenameDialog({ open: false, projectId: "", projectName: "", projectDescription: "" })
          })
        }}
        projectName={renameDialog.projectName}
        projectDescription={renameDialog.projectDescription}
        isRenaming={isRenaming}
      />
    </div>
  )
}
