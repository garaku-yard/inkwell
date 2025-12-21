"use client"

import { Database, Trash2, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ClearCacheDialog } from "@/components/settings/clear-cache-dialog"
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog"
import { RequestDataDeletionDialog } from "@/components/settings/request-data-deletion-dialog"
import { useState } from "react"

interface DataControlSectionProps {
  userEmail: string
}

export function DataControlSection({ userEmail }: DataControlSectionProps) {
  const [showClearCache, setShowClearCache] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [showRequestDeletion, setShowRequestDeletion] = useState(false)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Cache Management</CardTitle>
              <CardDescription>
                Clear local data to free up space or resolve issues
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium mb-1">Clear Local Cache</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Remove temporary files and cached data from your browser. This won't delete your projects.
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowClearCache(true)}>
              Clear Cache
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle>Data Deletion Request</CardTitle>
              <CardDescription>
                Request deletion of your personal data (GDPR compliant)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium mb-1">Request Data Deletion</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Submit a request to delete your personal information from our servers.
                We'll process your request within 30 days.
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowRequestDeletion(true)}>
              Request
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2">
              <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions that will permanently affect your account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium mb-1 text-red-600 dark:text-red-400">Delete Account</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setShowDeleteAccount(true)}>
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      <ClearCacheDialog open={showClearCache} onOpenChange={setShowClearCache} />
      <DeleteAccountDialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount} userEmail={userEmail} />
      <RequestDataDeletionDialog open={showRequestDeletion} onOpenChange={setShowRequestDeletion} userEmail={userEmail} />
    </div>
  )
}
