"use client"

import { Cloud, FileText, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * Integrations settings page.
 *
 * Cloud-storage integrations (Google Drive, Dropbox, OneDrive) require OAuth
 * flows the backend doesn't yet implement; they're surfaced here as "Coming
 * soon" so the user knows the roadmap without the previous mock-toggle UX.
 *
 * Export formats (FDX, Fountain, PDF) are always enabled: they live in the
 * gateway's `/projects/{id}/export?format=...` endpoint and don't need
 * per-user opt-in. They're shown here as a reference of what you can export,
 * not as gated features.
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

  const availableExports = [
    {
      name: "Final Draft (.fdx)",
      description: "Screenplay XML format accepted by Final Draft, Highland, and WriterDuet",
    },
    {
      name: "PDF",
      description: "Industry-standard formatted PDF with proper screenplay margins and fonts",
    },
    {
      name: "Fountain",
      description: "Plain-text screenplay format — coming soon",
      comingSoon: true,
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

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Available Export Formats</CardTitle>
              <CardDescription>
                Formats you can export your projects to today
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableExports.map((fmt) => (
            <div
              key={fmt.name}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800"
            >
              <div>
                <h4 className="font-medium text-sm">{fmt.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmt.description}
                </p>
              </div>
              {fmt.comingSoon ? (
                <Badge variant="secondary">Coming soon</Badge>
              ) : (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Available
                </Badge>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">
            Use the Export button on any project to download in one of these formats.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
