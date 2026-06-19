"use client"

import { Info, FileText, Scale, Code, RotateCcw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

export function AboutSection() {
  const { toast } = useToast()

  // Sourced from package.json at build time (see next.config.ts env block),
  // so these track the real release rather than drifting in the UI.
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"
  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE ?? "—"
  const environment =
    process.env.NODE_ENV === "production" ? "Production" : "Development"

  // Clears known local-preference keys. Server-side state (account, projects,
  // workspaces) is untouched. The allow-list is explicit so an errant addition
  // can't accidentally nuke the auth token or unrelated localStorage entries.
  const handleResetSettings = () => {
    if (typeof window === "undefined") return
    const keysToClear = [
      "inkwell:notifications",
      "inkwell:privacy",
      "inkwell:collaboration",
      // accessibility prefs now live inside inkwell:appearance (ThemeContext)
      "inkwell:appearance",
    ]
    keysToClear.forEach((key) => localStorage.removeItem(key))
    toast({
      title: "Preferences reset",
      description: "Local settings restored to defaults. Your account, projects, and workspaces are unchanged.",
    })
  }

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
            <Badge variant="outline">{environment}</Badge>
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
          <p className="text-sm text-muted-foreground mb-3">
            Release notes for every version are published on GitHub.
          </p>
          <Button variant="outline" className="w-full justify-start" asChild>
            <a
              href="https://github.com/garaku-yard/inkwell/releases"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="h-4 w-4 mr-2" />
              View releases on GitHub
            </a>
          </Button>
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
            <a href="/refund" target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4 mr-2" />
              Refund Policy
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
