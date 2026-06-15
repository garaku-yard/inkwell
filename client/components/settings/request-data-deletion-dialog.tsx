"use client"

import { useState, useEffect } from "react"
import { Loader2, Clock } from "lucide-react"
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
import { requestDataDeletion, getDataDeletionStatus, type DataDeletionRequest } from "@/services/settings"

interface RequestDataDeletionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
}

export function RequestDataDeletionDialog({ 
  open, 
  onOpenChange, 
  userEmail 
}: RequestDataDeletionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<DataDeletionRequest | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      loadStatus()
    }
  }, [open])

  const loadStatus = async () => {
    setIsLoadingStatus(true)
    try {
      const status = await getDataDeletionStatus()
      setPendingRequest(status)
    } catch (error) {
      // No pending request or error loading
      setPendingRequest(null)
    } finally {
      setIsLoadingStatus(false)
    }
  }

  const handleSubmitRequest = async () => {
    setIsSubmitting(true)
    try {
      const request = await requestDataDeletion()
      
      toast({
        title: "Data deletion request submitted",
        description: "Your request has been received and will be processed within 30 days.",
      })
      
      setPendingRequest(request)
    } catch (error) {
      toast({
        title: "Failed to submit request",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {isLoadingStatus ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pendingRequest ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-500" />
                Pending Data Deletion Request
              </DialogTitle>
              <DialogDescription className="pt-4 space-y-3">
                <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 rounded-lg p-4">
                  <p className="text-sm text-orange-900 dark:text-orange-100">
                    You have an active data deletion request.
                  </p>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Status:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                      {pendingRequest.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Submitted:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatDate(pendingRequest.createdAt)}
                    </span>
                  </div>
                  {pendingRequest.expectedCompletionDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Expected by:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatDate(pendingRequest.expectedCompletionDate)}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 pt-2">
                  Your personal data will be deleted while your account remains active. 
                  You will be notified once the process is complete.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request Data Deletion</DialogTitle>
              <DialogDescription className="pt-4 space-y-3">
                <p>
                  This will submit a request to delete your personal data in compliance 
                  with data protection regulations (GDPR).
                </p>
                
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    What will be deleted:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                    <li>Personal information (name, email, phone)</li>
                    <li>User preferences and settings</li>
                    <li>Activity logs and history</li>
                    <li>Analytics and usage data</li>
                  </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    What will be kept:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    <li>Your account (remains active)</li>
                    <li>Your projects and content</li>
                    <li>Collaboration and sharing access</li>
                  </ul>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 pt-2">
                  <strong>Processing time:</strong> Up to 30 days
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Account: <span className="font-mono font-medium">{userEmail}</span>
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmitRequest} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
