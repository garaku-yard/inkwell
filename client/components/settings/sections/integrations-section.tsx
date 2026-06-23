"use client"

import { Cloud } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * Integrations settings page.
 *
 * Cloud-storage integrations (Google Drive, Dropbox, OneDrive) require OAuth
 * flows the backend doesn't yet implement; they're surfaced here as "Coming
 * soon" so the user knows the roadmap without the previous mock-toggle UX.
 *
 */
export function IntegrationsSection() {
  const cloudProviders = [
    {
      id: "gdrive",
      name: "Google Drive",
      description: "Automatically sync your projects to Google Drive",
    },
    {
      id: "dropbox",
      name: "Dropbox",
      description: "Backup your work to Dropbox automatically",
    },
    {
      id: "onedrive",
      name: "OneDrive",
      description: "Sync projects with Microsoft OneDrive",
    },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Cloud Storage</CardTitle>
              <CardDescription>
                Keep your projects in sync with your preferred cloud provider
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cloudProviders.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 opacity-75"
            >
              <div>
                <h4 className="font-medium text-sm">{provider.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {provider.description}
                </p>
              </div>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">
            OAuth integrations require additional backend work before they can
            securely connect to your storage provider. We&apos;ll enable them as
            each provider&apos;s flow is implemented.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
