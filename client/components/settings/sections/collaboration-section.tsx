"use client"

import { useState } from "react"
import { Users, MessageSquare, GitBranch, Lock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function CollaborationSection() {
  const [defaultSharePermission, setDefaultSharePermission] = useState("view")
  const [allowInvitePermission, setAllowInvitePermission] = useState("editor")
  const [allowComments, setAllowComments] = useState(true)
  const [enableTrackChanges, setEnableTrackChanges] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Sharing Permissions</CardTitle>
              <CardDescription>
                Control default permissions when sharing projects
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="defaultShare">Default Share Permission</Label>
            <Select value={defaultSharePermission} onValueChange={setDefaultSharePermission}>
              <SelectTrigger id="defaultShare">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View Only - Can read but not edit</SelectItem>
                <SelectItem value="comment">Comment - Can view and comment</SelectItem>
                <SelectItem value="edit">Edit - Can make changes</SelectItem>
                <SelectItem value="admin">Admin - Full control</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              New collaborators will receive this permission level by default
            </p>
          </div>

          <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
            <Label htmlFor="invitePermission">Who Can Invite Others</Label>
            <Select value={allowInvitePermission} onValueChange={setAllowInvitePermission}>
              <SelectTrigger id="invitePermission">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Only Admins</SelectItem>
                <SelectItem value="editor">Editors and Above</SelectItem>
                <SelectItem value="anyone">Anyone with Access</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Control who can invite new collaborators to your projects
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
            <div>
              <Label htmlFor="requireApproval">Require Approval for New Collaborators</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Project owners must approve all new collaborator invitations
              </p>
            </div>
            <Switch
              id="requireApproval"
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Commenting</CardTitle>
              <CardDescription>
                Configure how collaborators can comment on your projects
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="allowComments">Allow Comments</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Enable or disable commenting on your projects
              </p>
            </div>
            <Switch
              id="allowComments"
              checked={allowComments}
              onCheckedChange={setAllowComments}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <GitBranch className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Track Changes</CardTitle>
              <CardDescription>
                Keep a history of edits made by collaborators
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="trackChanges">Enable Track Changes</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                See who made which changes and when they were made
              </p>
            </div>
            <Switch
              id="trackChanges"
              checked={enableTrackChanges}
              onCheckedChange={setEnableTrackChanges}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Collaboration Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900 p-4">
            <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <li className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <span>Use "View Only" permissions for stakeholders who need to review but not edit</span>
              </li>
              <li className="flex items-start gap-2">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <span>Grant "Admin" access only to trusted team members who need full control</span>
              </li>
              <li className="flex items-start gap-2">
                <GitBranch className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <span>Track changes helps you review and revert edits if needed</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
