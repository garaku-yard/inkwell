"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface DeleteProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  projectName: string
  isDeleting?: boolean
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  onConfirm,
  projectName,
  isDeleting = false,
}: DeleteProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Project
          </DialogTitle>
          <DialogDescription className="text-left">
            Are you sure you want to delete <span className="font-semibold">"{projectName}"</span>? This action cannot
            be undone and will permanently remove all project data, including scripts, collaborators, and revision
            history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
