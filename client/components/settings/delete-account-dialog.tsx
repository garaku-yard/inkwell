"use client"

import { useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/AuthContext"
import { deleteAccount, verifyPassword } from "@/services/settings"

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
}

export function DeleteAccountDialog({ open, onOpenChange, userEmail }: DeleteAccountDialogProps) {
  const [step, setStep] = useState<"warning" | "verify" | "confirm">("warning")
  const [password, setPassword] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()
  const { logout } = useAuth()

  const resetDialog = () => {
    setStep("warning")
    setPassword("")
    setConfirmText("")
    setIsProcessing(false)
  }

  const handleClose = () => {
    if (!isProcessing) {
      resetDialog()
      onOpenChange(false)
    }
  }

  const handleProceedToVerify = () => {
    setStep("verify")
  }

  const handleVerifyPassword = async () => {
    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter your password to continue.",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)
    try {
      await verifyPassword(password)
      setStep("confirm")
    } catch (error) {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Incorrect password",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") {
      toast({
        title: "Confirmation required",
        description: 'Please type "DELETE" to confirm.',
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)
    try {
      await deleteAccount()
      
      toast({
        title: "Account deletion initiated",
        description: "Your account has been scheduled for deletion. You will now be logged out.",
      })
      
      // Close dialog and log out
      setTimeout(() => {
        logout()
      }, 2000)
    } catch (error) {
      toast({
        title: "Failed to delete account",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "warning" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Delete Account - Warning
              </DialogTitle>
              <DialogDescription className="pt-4 space-y-3">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  This action is permanent and cannot be undone.
                </p>
                <p>Deleting your account will:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Permanently delete all your projects</li>
                  <li>Remove all your personal data</li>
                  <li>Cancel any active subscriptions</li>
                  <li>Revoke access to shared projects</li>
                  <li>Delete all collaboration history</li>
                </ul>
                <p className="pt-2 text-red-600 dark:text-red-400 font-medium">
                  This data cannot be recovered after deletion.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleProceedToVerify}>
                I Understand, Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "verify" && (
          <>
            <DialogHeader>
              <DialogTitle>Verify Your Identity</DialogTitle>
              <DialogDescription className="pt-2">
                Please enter your password to confirm your identity.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isProcessing) {
                      handleVerifyPassword()
                    }
                  }}
                  disabled={isProcessing}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button onClick={handleVerifyPassword} disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-red-600 dark:text-red-400">
                Final Confirmation
              </DialogTitle>
              <DialogDescription className="pt-2 space-y-3">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Are you absolutely sure you want to delete your account?
                </p>
                <p className="text-sm">
                  Account: <span className="font-mono font-medium">{userEmail}</span>
                </p>
                <p className="text-sm">
                  Type <span className="font-mono font-bold">DELETE</span> below to confirm:
                </p>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isProcessing) {
                      handleDeleteAccount()
                    }
                  }}
                  disabled={isProcessing}
                  autoFocus
                  className="font-mono"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isProcessing || confirmText !== "DELETE"}
              >
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Account Permanently
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
