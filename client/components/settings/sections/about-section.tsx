"use client"

import { Info, FileText, Scale, Code, RotateCcw, Beaker } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export function AboutSection() {
  const [experimentalFeatures, setExperimentalFeatures] = useState(false)
  const { toast } = useToast()

  const appVersion = "1.0.0"
  const buildDate = "2024-03-15"

  // Clears known local-preference keys. Server-side state (account, projects,
  // workspaces) is untouched. The allow-list is explicit so an errant addition
  // can't accidentally nuke the auth token or unrelated localStorage entries.
  const handleResetSettings = () => {
    if (typeof window === "undefined") return
    const keysToClear = [
      "inkwell:notifications",
      "inkwell:privacy",
      "inkwell:collaboration",
      "inkwell:accessibility",
      "inkwell:appearance",
    ]
    keysToClear.forEach((key) => localStorage.removeItem(key))
    toast({
      title: "Preferences reset",
      description: "Local settings restored to defaults. Your account, projects, and workspaces are unchanged.",
    })
  }

  const changelog = [
    { version: "1.0.0", date: "2024-03-15", changes: ["Initial release", "Full screenplay editor", "Beat board", "Outline editor"] },
    { version: "0.9.0", date: "2024-02-01", changes: ["Beta release", "Added collaboration", "AI suggestions"] },
    { version: "0.8.0", date: "2024-01-15", changes: ["Alpha release", "Basic editor features"] }
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Application Information</CardTitle>
              <CardDescription>
                Version and build details
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Version</span>
            <Badge variant="secondary">{appVersion}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Build Date</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{buildDate}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Environment</span>
            <Badge variant="outline">Production</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Changelog</CardTitle>
              <CardDescription>
                Recent updates and improvements
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {changelog.map((entry) => (
              <div key={entry.version} className="border-l-2 border-blue-500 pl-4 pb-4 last:pb-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">{entry.version}</Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{entry.date}</span>
                </div>
                <ul className="space-y-1">
                  {entry.changes.map((change, index) => (
                    <li key={index} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <Scale className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Legal</CardTitle>
              <CardDescription>
                Terms, privacy, and licenses
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start" asChild>
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4 mr-2" />
              Terms of Service
            </a>
          </Button>
          <Button variant="outline" className="w-full justify-start" asChild>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4 mr-2" />
              Privacy Policy
            </a>
          </Button>
          <Button variant="outline" className="w-full justify-start" asChild>
            <a href="/licenses" target="_blank" rel="noopener noreferrer">
              <Code className="h-4 w-4 mr-2" />
              Open Source Licenses
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-2">
              <Beaker className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle>Experimental Features</CardTitle>
              <CardDescription>
                Try out new features before they're officially released
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="experimentalFeatures">Enable Experimental Features</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Access beta features and early previews
              </p>
            </div>
            <Switch
              id="experimentalFeatures"
              checked={experimentalFeatures}
              onCheckedChange={setExperimentalFeatures}
            />
          </div>
          {experimentalFeatures && (
            <div className="mt-4 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                <strong>Warning:</strong> Experimental features may be unstable and are subject to change.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2">
              <RotateCcw className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle>Reset Settings</CardTitle>
              <CardDescription>
                Restore all settings to their default values
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium mb-1">Reset to Defaults</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This will reset all preferences to their original values. Your projects will not be affected.
              </p>
            </div>
            <Button variant="outline" onClick={handleResetSettings}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
