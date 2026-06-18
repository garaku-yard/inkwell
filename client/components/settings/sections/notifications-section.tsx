"use client"

import { useState, useEffect } from "react"
import { Mail, Bell, MessageSquare, AtSign, Megaphone, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { PreviewNotice } from "@/components/settings/preview-notice"
import { getStorage, type NotificationPreferences } from "@/lib/storage"

const DEFAULTS: NotificationPreferences = {
  emailComments: true,
  emailMentions: true,
  emailProjectUpdates: true,
  emailCollaboratorJoins: true,
  inAppNotifications: true,
  marketingEmails: false,
  productUpdates: true,
}

export function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS)
  const { toast } = useToast()
  // Hosted builds persist preferences server-side (synced + feeding the
  // delivery worker); the desktop build keeps them on-device. The copy and
  // toast wording follow this distinction.
  const serverSide = getStorage().capabilities.has("notifications")

  useEffect(() => {
    let active = true
    getStorage()
      .notifications.getPreferences()
      .then((p) => { if (active) setPrefs(p) })
      .catch(() => { /* keep defaults on read failure */ })
    return () => { active = false }
  }, [])

  const update = (key: keyof NotificationPreferences, value: boolean) => {
    const next = { ...prefs, [key]: value }
    const prev = prefs
    setPrefs(next)
    getStorage()
      .notifications.updatePreferences(next)
      .then(() => {
        toast({
          title: serverSide ? "Preferences saved" : "Saved on this device",
          description: serverSide
            ? "Notification preferences updated for your account."
            : "Notification preferences updated locally.",
        })
      })
      .catch(() => {
        setPrefs(prev) // revert optimistic toggle on failure
        toast({
          variant: "destructive",
          title: "Couldn't save",
          description: "Your notification preferences weren't saved. Please try again.",
        })
      })
  }

  const { emailComments, emailMentions, emailProjectUpdates, emailCollaboratorJoins,
          inAppNotifications, marketingEmails, productUpdates } = prefs

  return (
    <div className="space-y-6">
      <PreviewNotice>
        {serverSide ? (
          <>
            Saved to your account. Email and in-app delivery are rolling out —
            mentions, project-update emails, and marketing broadcasts aren&apos;t
            delivered yet.
          </>
        ) : (
          <>
            Saved on this device. The desktop app doesn&apos;t deliver
            notifications — these preferences apply on the hosted service.
          </>
        )}
      </PreviewNotice>
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
                onCheckedChange={(v) => update("emailComments", v)}
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
                onCheckedChange={(v) => update("emailMentions", v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <TrendingUp className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <Label htmlFor="emailProjectUpdates">Project Updates</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Get notified about changes to projects you&apos;re collaborating on
                  </p>
                </div>
              </div>
              <Switch
                id="emailProjectUpdates"
                checked={emailProjectUpdates}
                onCheckedChange={(v) => update("emailProjectUpdates", v)}
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
                onCheckedChange={(v) => update("emailCollaboratorJoins", v)}
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
              onCheckedChange={(v) => update("inAppNotifications", v)}
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
                onCheckedChange={(v) => update("marketingEmails", v)}
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
                onCheckedChange={(v) => update("productUpdates", v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
