import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus, X, AlertCircle } from "lucide-react"

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

import { createProject, Project } from "@/services/project"

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
  onProjectCreated: (newProject: Project) => void;
}

export function NewProjectDialog({ open, onOpenChange, onProjectCreated }: NewProjectDialogProps) {
  const [projectName, setProjectName] = useState("")
  const [projectType, setProjectType] = useState("")
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [collaboratorInput, setCollaboratorInput] = useState("")
  const [openTypeSelect, setOpenTypeSelect] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()

  const handleAddCollaborator = () => {
    if (collaboratorInput && collaboratorInput.includes('#') && !collaborators.includes(collaboratorInput)) {
      setCollaborators([...collaborators, collaboratorInput])
      setCollaboratorInput("")
    } else {
      console.log("Invalid format. Please use username#tag");
    }
  }

  const handleRemoveCollaborator = (collaborator: string) => {
    setCollaborators(collaborators.filter((c) => c !== collaborator))
  }

  const handleCreateProject = async () => {
    if (!projectName) {
      setError("Project name is required.")
      return
    }

    setIsLoading(true)
    setError(null)

    // --- DEBUGGING STEP ---
    const payload = {
      projectName: projectName,
      description: projectTypes.find(t => t.value === projectType)?.label || "New Project",
    };

    console.log("Sending payload to createProject:", payload);
    // --- END DEBUGGING STEP ---

    try {
      const newProject = await createProject(payload)

      // TODO: Add collaborators API call here.

      onProjectCreated(newProject);
      onOpenChange(false)

      router.push(`/project/${newProject.id}`);

    } catch (err: any) {
      setError(err.message || "An unknown error occurred.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ... The rest of your dialog JSX remains the same ... */}
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
                {collaborators.map((collaborator) => (
                  <Badge key={collaborator} variant="secondary" className="pl-2">
                    {collaborator}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1 hover:bg-transparent"
                      onClick={() => handleRemoveCollaborator(collaborator)}
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
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
