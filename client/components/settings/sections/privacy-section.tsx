"use client"

import { useState } from "react"
import { Eye, EyeOff, Globe, FileText } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function PrivacySection() {
  const [profileVisibility, setProfileVisibility] = useState("public")
  const [projectVisibilityDefault, setProjectVisibilityDefault] = useState("private")
  const [allowSearchEngineIndexing, setAllowSearchEngineIndexing] = useState(true)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Visibility</CardTitle>
          <CardDescription>
            Control who can see your profile and projects
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
                <Eye className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="profileVisibility">Profile Visibility</Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Choose who can see your public profile
                    </p>
                  </div>
                </div>
                <Select value={profileVisibility} onValueChange={setProfileVisibility}>
                  <SelectTrigger id="profileVisibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public - Anyone can see</SelectItem>
                    <SelectItem value="followers">Followers Only</SelectItem>
                    <SelectItem value="private">Private - Only me</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="projectVisibility">Default Project Visibility</Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Set the default visibility for new projects
                    </p>
                  </div>
                </div>
                <Select value={projectVisibilityDefault} onValueChange={setProjectVisibilityDefault}>
                  <SelectTrigger id="projectVisibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public - Anyone can view</SelectItem>
                    <SelectItem value="unlisted">Unlisted - Only with link</SelectItem>
                    <SelectItem value="private">Private - Only invited users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search Engine Indexing</CardTitle>
          <CardDescription>
            Control whether your public content appears in search engine results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <Globe className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="searchIndexing">Allow Search Engine Indexing</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Let search engines like Google index your public profile and projects
                  </p>
                </div>
                <Switch
                  id="searchIndexing"
                  checked={allowSearchEngineIndexing}
                  onCheckedChange={setAllowSearchEngineIndexing}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Usage & Transparency</CardTitle>
          <CardDescription>
            Learn how we use your data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900 p-4">
            <h4 className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">
              How We Use Your Data
            </h4>
            <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                <span>Project data is stored securely and encrypted at rest</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                <span>We use anonymized analytics to improve our services</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                <span>Your email is only used for account-related communications</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                <span>We never sell your personal data to third parties</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
