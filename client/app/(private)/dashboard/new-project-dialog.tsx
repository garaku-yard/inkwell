import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus, X, AlertCircle } from "lucide-react"
import { CollaboratorRoles, CollaboratorRole, collaboratorRoleOptions } from "@/models/constants/collaboratorRoles"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"

import { createProject, addCollaborator, Project, deleteProject } from "@/services/project"

const projectTypes = [
  { value: "feature", label: "Feature Film" },
  { value: "short", label: "Short Film" },
  { value: "tv-pilot", label: "TV Pilot" },
  { value: "tv-episode", label: "TV Episode" },
  { value: "documentary", label: "Documentary" },
  { value: "web-series", label: "Web Series" },
]

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectCreated: (newProject: Project) => void
}

export function NewProjectDialog({ open, onOpenChange, onProjectCreated }: NewProjectDialogProps) {
  const [projectName, setProjectName] = useState("")
  const [description, setDescription] = useState("")
  const [projectType, setProjectType] = useState("")
  const [collaborators, setCollaborators] = useState<{ username: string; role: CollaboratorRole }[]>([])
  const [collaboratorInput, setCollaboratorInput] = useState("")
  const [openTypeSelect, setOpenTypeSelect] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const { user } = useAuth()
  const userId = user?.id

  const handleAddCollaborator = () => {
    const trimmed = collaboratorInput.trim()
    if (
      trimmed &&
      trimmed.includes("#") &&
      !collaborators.find(c => c.username === trimmed)
    ) {
      setCollaborators([...collaborators, { username: trimmed, role: "viewer" }])
      setCollaboratorInput("")
    } else {
      console.log("Invalid format. Please use username#tag")
    }
  }

  const handleRemoveCollaborator = (username: string) => {
    setCollaborators(collaborators.filter((c) => c.username !== username))
  }


  const handleCreateProject = async () => {
    if (!projectName) {
      setError("Project name is required.")
      return
    }

    if (!userId) {
      setError("User not authenticated.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const newProject = await createProject({
        title: projectName,
        description: description || projectTypes.find(t => t.value === projectType)?.label || "New Project",
        owner_id: userId,
      })

      // Note: Collaborators will be implemented later in collaboration service
      if (collaborators.length > 0) {
        console.warn("Collaborators not yet implemented in microservices backend")
      }

      onProjectCreated(newProject)
      onOpenChange(false)
      router.push(`/projects/${newProject.id}/editor`)

    } catch (err: any) {
      setError(err.message || "An unknown error occurred.")
    } finally {
      setIsLoading(false)
    }
  }




  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up your new screenplay project. You can add collaborators by their unique username.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="Enter project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Description (Optional)</Label>
            <Input
              id="project-description"
              placeholder="Brief description of your project"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-type">Project Type</Label>
            <Popover open={openTypeSelect} onOpenChange={setOpenTypeSelect}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={openTypeSelect} className="justify-between" disabled={isLoading}>
                  {projectType
                    ? projectTypes.find((type) => type.value === projectType)?.label
                    : "Select project type..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search project types..." />
                  <CommandList>
                    <CommandEmpty>No project type found.</CommandEmpty>
                    <CommandGroup>
                      {projectTypes.map((type) => (
                        <CommandItem
                          key={type.value}
                          value={type.value}
                          onSelect={(currentValue) => {
                            setProjectType(currentValue === projectType ? "" : currentValue)
                            setOpenTypeSelect(false)
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", projectType === type.value ? "opacity-100" : "opacity-0")}
                          />
                          {type.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="collaborators">Collaborators (Optional)</Label>
            <div className="flex gap-2">
              <Input
                id="collaborators"
                placeholder="Add user by username#tag"
                value={collaboratorInput}
                onChange={(e) => setCollaboratorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddCollaborator()
                  }
                }}
                disabled={isLoading}
              />
              <Button type="button" onClick={handleAddCollaborator} size="icon" disabled={isLoading}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {collaborators.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {collaborators.map((collaborator, index) => (
                  <div key={collaborator.username} className="flex items-center gap-2">
                    <Badge variant="secondary" className="pl-2">
                      {collaborator.username}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 hover:bg-transparent"
                        onClick={() => handleRemoveCollaborator(collaborator.username)}
                        disabled={isLoading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          {CollaboratorRoles[collaborator.role]}
                          <ChevronsUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-0">
                        <Command>
                          <CommandList>
                            <CommandGroup>
                              {collaboratorRoleOptions.map((option) => (
                                <CommandItem
                                  key={option.value}
                                  value={option.value}
                                  onSelect={() => {
                                    const updated = [...collaborators]
                                    updated[index].role = option.value as CollaboratorRole
                                    setCollaborators(updated)
                                  }}
                                >
                                  <Check
                                    className={cn("mr-2 h-4 w-4", collaborator.role === option.value ? "opacity-100" : "opacity-0")}
                                  />
                                  {option.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}

              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreateProject} disabled={!projectName || isLoading}>
            {isLoading ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
