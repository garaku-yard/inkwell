"use client"

import { useState } from "react"
import { Mail, Bell, MessageSquare, AtSign, Megaphone, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function NotificationsSection() {
  const [emailComments, setEmailComments] = useState(true)
  const [emailMentions, setEmailMentions] = useState(true)
  const [emailProjectUpdates, setEmailProjectUpdates] = useState(true)
  const [emailCollaboratorJoins, setEmailCollaboratorJoins] = useState(true)
  const [inAppNotifications, setInAppNotifications] = useState(true)
  const [marketingEmails, setMarketingEmails] = useState(false)
  const [productUpdates, setProductUpdates] = useState(true)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Choose which emails you want to receive
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <MessageSquare className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <Label htmlFor="emailComments">Comments</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Get notified when someone comments on your projects
                  </p>
                </div>
              </div>
              <Switch
                id="emailComments"
                checked={emailComments}
                onCheckedChange={setEmailComments}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <AtSign className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <Label htmlFor="emailMentions">Mentions</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Get notified when someone mentions you
                  </p>
                </div>
              </div>
              <Switch
                id="emailMentions"
                checked={emailMentions}
                onCheckedChange={setEmailMentions}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <TrendingUp className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <Label htmlFor="emailProjectUpdates">Project Updates</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Get notified about changes to projects you're collaborating on
                  </p>
                </div>
              </div>
              <Switch
                id="emailProjectUpdates"
                checked={emailProjectUpdates}
                onCheckedChange={setEmailProjectUpdates}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Bell className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <Label htmlFor="emailCollaboratorJoins">New Collaborators</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Get notified when someone joins your project
                  </p>
                </div>
              </div>
              <Switch
                id="emailCollaboratorJoins"
                checked={emailCollaboratorJoins}
                onCheckedChange={setEmailCollaboratorJoins}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <Bell className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>In-App Notifications</CardTitle>
              <CardDescription>
                Manage notifications you see within the application
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="inAppNotifications">Enable In-App Notifications</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Show notifications for comments, mentions, and updates
              </p>
            </div>
            <Switch
              id="inAppNotifications"
              checked={inAppNotifications}
              onCheckedChange={setInAppNotifications}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-2">
              <Megaphone className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle>Marketing & Product Updates</CardTitle>
              <CardDescription>
                Stay informed about new features and offers
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="marketingEmails">Marketing Emails</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Receive promotional content and special offers
                </p>
              </div>
              <Switch
                id="marketingEmails"
                checked={marketingEmails}
                onCheckedChange={setMarketingEmails}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="productUpdates">Product Updates</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Get notified about new features and improvements
                </p>
              </div>
              <Switch
                id="productUpdates"
                checked={productUpdates}
                onCheckedChange={setProductUpdates}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
