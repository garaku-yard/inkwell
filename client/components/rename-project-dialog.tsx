"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Edit3, Loader2 } from "lucide-react"

interface RenameProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (newName: string, newDescription: string) => void
  projectName: string
  projectDescription: string
  isRenaming?: boolean
}

const descriptionOptions = [
  { value: "feature", label: "Feature Film" },
  { value: "short", label: "Short Film" },
  { value: "tv-pilot", label: "TV Pilot" },
  { value: "tv-episode", label: "TV Episode" },
  { value: "documentary", label: "Documentary" },
  { value: "web-series", label: "Web Series" },
]
// Add this function after the descriptionOptions array
const getDescriptionLabel = (value: string) => {
    const option = descriptionOptions.find((opt) => opt.value === value)
    return option ? option.label : value // Return the original value if not found in options
  }

export function RenameProjectDialog({
  open,
  onOpenChange,
  onConfirm,
  projectName,
  projectDescription,
  isRenaming = false,
}: RenameProjectDialogProps) {
  const [newName, setNewName] = useState(projectName)
  const [newDescription, setNewDescription] = useState(projectDescription)

  // Reset form when dialog opens/closes or project changes
  useEffect(() => {
    if (open) {
      setNewName(projectName)
      setNewDescription(projectDescription || "")
    }
  }, [open, projectName, projectDescription])

  // Ensure the current description is always in the dropdown list
  const dynamicOptions = [...descriptionOptions]
  if (
    projectDescription &&
    !descriptionOptions.some((opt) => opt.value === projectDescription)
  ) {
    dynamicOptions.unshift({ value: projectDescription, label: projectDescription })
  }

  const handleSubmit = (e: any) => {
    e.preventDefault()
    if (!newName.trim()) return
    onConfirm(newName.trim(), getDescriptionLabel(newDescription))
  }

  const hasChanges =
    newName.trim() !== projectName || newDescription !== projectDescription

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Rename Project
          </DialogTitle>
          <DialogDescription>
            Update the name and type for your project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter project name"
              disabled={isRenaming}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Project Type</Label>
            <Select
              value={newDescription}
              onValueChange={setNewDescription}
              disabled={isRenaming}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a description" />
              </SelectTrigger>
              <SelectContent>
                {dynamicOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isRenaming || !newName.trim() || !hasChanges}
            >
              {isRenaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
