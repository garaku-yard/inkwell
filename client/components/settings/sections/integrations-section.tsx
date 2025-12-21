"use client"

import { useState } from "react"
import { Cloud, FileText, Plug, CheckCircle2, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  connected: boolean
  category: "cloud" | "export"
}

export function IntegrationsSection() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "gdrive",
      name: "Google Drive",
      description: "Automatically sync your projects to Google Drive",
      icon: "☁️",
      connected: false,
      category: "cloud"
    },
    {
      id: "dropbox",
      name: "Dropbox",
      description: "Backup your work to Dropbox automatically",
      icon: "📦",
      connected: false,
      category: "cloud"
    },
    {
      id: "onedrive",
      name: "OneDrive",
      description: "Sync projects with Microsoft OneDrive",
      icon: "☁️",
      connected: false,
      category: "cloud"
    },
    {
      id: "finaldraft",
      name: "Final Draft",
      description: "Export your screenplays to Final Draft format (.fdx)",
      icon: "📝",
      connected: true,
      category: "export"
    },
    {
      id: "fountain",
      name: "Fountain",
      description: "Export to Fountain plain text format",
      icon: "⛲",
      connected: true,
      category: "export"
    },
    {
      id: "pdf",
      name: "PDF Export",
      description: "Export professionally formatted PDFs",
      icon: "📄",
      connected: true,
      category: "export"
    }
  ])

  const handleToggleIntegration = (id: string) => {
    setIntegrations(integrations.map(integration => 
      integration.id === id 
        ? { ...integration, connected: !integration.connected }
        : integration
    ))
  }

  const cloudIntegrations = integrations.filter(i => i.category === "cloud")
  const exportIntegrations = integrations.filter(i => i.category === "export")

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
                Connect your cloud storage providers for automatic backups
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cloudIntegrations.map((integration) => (
            <div 
              key={integration.id} 
              className="flex items-start justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800"
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl">{integration.icon}</div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{integration.name}</h4>
                    <Badge variant={integration.connected ? "default" : "secondary"} className="gap-1">
                      {integration.connected ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          Not Connected
                        </>
                      )}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {integration.description}
                  </p>
                </div>
              </div>
              <Button 
                variant={integration.connected ? "outline" : "default"}
                onClick={() => handleToggleIntegration(integration.id)}
              >
                {integration.connected ? "Disconnect" : "Connect"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Export Formats</CardTitle>
              <CardDescription>
                Enable or disable export options for your projects
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {exportIntegrations.map((integration) => (
            <div 
              key={integration.id}
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800"
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl">{integration.icon}</div>
                <div>
                  <h4 className="font-medium mb-1">{integration.name}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {integration.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={integration.connected}
                onCheckedChange={() => handleToggleIntegration(integration.id)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <Plug className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Coming Soon</CardTitle>
              <CardDescription>
                More integrations are on the way
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              We're working on integrations with:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-lg">📧</span>
                <span>Gmail</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-lg">📅</span>
                <span>Google Calendar</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-lg">💬</span>
                <span>Slack</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-lg">📊</span>
                <span>Notion</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
