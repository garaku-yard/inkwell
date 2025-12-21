"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { clearCache } from "@/services/settings"

interface ClearCacheDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClearCacheDialog({ open, onOpenChange }: ClearCacheDialogProps) {
  const [isClearing, setIsClearing] = useState(false)
  const { toast } = useToast()

  const handleClearCache = async () => {
    setIsClearing(true)
    try {
      await clearCache()
      
      toast({
        title: "Cache cleared successfully",
        description: "Your local cached data has been removed.",
      })
      
      onOpenChange(false)
      
      // Optionally reload the page to reflect cache clearing
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      toast({
        title: "Failed to clear cache",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clear cached data?</DialogTitle>
          <DialogDescription className="pt-2 space-y-2">
            <p>This will remove:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>UI state and preferences</li>
              <li>Temporary files</li>
              <li>Editor cache</li>
              <li>AI response cache</li>
            </ul>
            <p className="pt-2 font-medium">
              Your projects and account data will not be affected.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isClearing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleClearCache}
            disabled={isClearing}
          >
            {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Clear Cache
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
