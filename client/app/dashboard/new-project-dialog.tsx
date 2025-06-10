"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus, X } from "lucide-react"

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
import { cn } from "@/lib/utils"

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
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const [projectName, setProjectName] = useState("")
  const [projectType, setProjectType] = useState("")
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [collaboratorInput, setCollaboratorInput] = useState("")
  const [openTypeSelect, setOpenTypeSelect] = useState(false)

  const router = useRouter()

  const handleAddCollaborator = () => {
    if (collaboratorInput && !collaborators.includes(collaboratorInput)) {
      setCollaborators([...collaborators, collaboratorInput])
      setCollaboratorInput("")
    }
  }

  const handleRemoveCollaborator = (collaborator: string) => {
    setCollaborators(collaborators.filter((c) => c !== collaborator))
  }

  const handleCreateProject = () => {
    // In a real app, you would create the project in the database
    // For now, we'll just navigate to the editor with a new ID
    const newProjectId = Math.random().toString(36).substring(2, 9)
    router.push(`/project/${newProjectId}`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up your new screenplay project. You can add collaborators and choose the project type.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="Enter project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-type">Project Type</Label>
            <Popover open={openTypeSelect} onOpenChange={setOpenTypeSelect}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={openTypeSelect} className="justify-between">
                  {projectType
                    ? projectTypes.find((type) => type.value === projectType)?.label
                    : "Select project type..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0">
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
                placeholder="Add email address"
                value={collaboratorInput}
                onChange={(e) => setCollaboratorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddCollaborator()
                  }
                }}
              />
              <Button type="button" onClick={handleAddCollaborator} size="icon">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateProject} disabled={!projectName}>
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
