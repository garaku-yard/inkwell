import { useState, useCallback } from "react"
import { X, AlertCircle, Upload, FileText, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type CollaboratorRole } from "@/models/constants/collaboratorRoles"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { Project } from "@/services/project"

const projectTypes = [
  { value: "feature", label: "Feature Film" },
  { value: "short", label: "Short Film" },
  { value: "tv-pilot", label: "TV Pilot" },
  { value: "tv-episode", label: "TV Episode" },
  { value: "documentary", label: "Documentary" },
  { value: "web-series", label: "Web Series" },
]

interface Collaborator {
  email: string
  role: CollaboratorRole
}

interface ImportProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectImported: (project: Project) => void
}

export function ImportProjectDialog({ open, onOpenChange, onProjectImported }: ImportProjectDialogProps) {
  const router = useRouter()
  const [projectName, setProjectName] = useState("")
  const [projectType, setProjectType] = useState(projectTypes[0].value)
  const [, setCollaborators] = useState<Collaborator[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const resetState = useCallback(() => {
    setProjectName("")
    setProjectType(projectTypes[0].value)
    setCollaborators([])
    setSelectedFile(null)
    setError(null)
    setIsLoading(false)
    setIsDragging(false)
  }, [])

  const handleOpenChange = useCallback((open: boolean) => {
    onOpenChange(open)
    if (!open) {
      resetState()
    }
  }, [onOpenChange, resetState])



  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      validateAndSetFile(file)
    }
  }

  const validateAndSetFile = (file: File) => {
    const allowedExtensions = ['.fdx'];
    const fileNameLower = file.name.toLowerCase();
    const isValid = allowedExtensions.some(ext => fileNameLower.endsWith(ext));

    if (!isValid) {
      setError("Unsupported file type. Please upload .fdx (Final Draft) files only.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setError(null);
    if (!projectName) {
      const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
      setProjectName(nameWithoutExtension);
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      validateAndSetFile(event.target.files[0])
    }
  }

  const handleImportProject = async () => {
    if (!projectName || !projectType || !selectedFile) {
      setError("Please ensure you have entered a project name, selected a file, and chosen a project type.")
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('projectName', projectName)
      formData.append('projectType', projectType)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/import-fdx`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Import failed' }))
        throw new Error(errorData.message || 'Failed to import screenplay')
      }

      const importedProject: Project = await response.json()

      onProjectImported(importedProject)
      handleOpenChange(false)
      router.push(`/projects/editor?id=${importedProject.id}`)

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import project. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Screenplay</DialogTitle>
          <DialogDescription>
            Upload your screenplay and set up your project details
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Screenplay File</Label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer",
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
                selectedFile && "border-primary bg-primary/5"
              )}
            >
              <input
                id="file-upload"
                type="file"
                onChange={handleFileChange}
                accept=".fdx"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isLoading}
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFile(null)
                      setProjectName("")
                    }}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove File
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="p-3 bg-muted rounded-full">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      Drag and drop your screenplay here
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      or click to browse files
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supports .fdx (Final Draft) files
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleImportProject}
            disabled={!projectName || !selectedFile || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
