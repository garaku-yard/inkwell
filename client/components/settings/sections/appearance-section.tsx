"use client"

import { useState } from "react"
import { Palette, Type, Layout, Monitor, Moon, Sun, Crown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface Theme {
  id: string
  name: string
  description: string
  preview: {
    primary: string
    secondary: string
    accent: string
  }
  requiresPro: boolean
}

interface AppearanceSectionProps {
  userRole?: string
}

export function AppearanceSection({ userRole }: AppearanceSectionProps) {
  const isPro = userRole === "admin" || userRole === "pro"
  const [selectedTheme, setSelectedTheme] = useState("default")
  const [colorMode, setColorMode] = useState<"light" | "dark" | "system">("system")
  const [editorFont, setEditorFont] = useState("courier")
  const [uiFont, setUiFont] = useState("inter")
  const [editorLineHeight, setEditorLineHeight] = useState("1.6")
  const { toast } = useToast()

  const themes: Theme[] = [
    {
      id: "default",
      name: "Default",
      description: "Clean and professional",
      preview: { primary: "#3b82f6", secondary: "#64748b", accent: "#8b5cf6" },
      requiresPro: false
    },
    {
      id: "ocean",
      name: "Ocean",
      description: "Calming blues and teals",
      preview: { primary: "#0ea5e9", secondary: "#06b6d4", accent: "#14b8a6" },
      requiresPro: true
    },
    {
      id: "forest",
      name: "Forest",
      description: "Natural greens",
      preview: { primary: "#22c55e", secondary: "#84cc16", accent: "#10b981" },
      requiresPro: true
    },
    {
      id: "sunset",
      name: "Sunset",
      description: "Warm oranges and reds",
      preview: { primary: "#f97316", secondary: "#ef4444", accent: "#f59e0b" },
      requiresPro: true
    },
    {
      id: "midnight",
      name: "Midnight",
      description: "Deep purples and blues",
      preview: { primary: "#8b5cf6", secondary: "#6366f1", accent: "#a855f7" },
      requiresPro: true
    },
    {
      id: "rose",
      name: "Rose",
      description: "Elegant pinks",
      preview: { primary: "#ec4899", secondary: "#f43f5e", accent: "#e11d48" },
      requiresPro: true
    }
  ]

  const handleThemeSelect = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId)
    if (theme?.requiresPro && !isPro) {
      toast({
        title: "Pro Feature",
        description: "Upgrade to Pro to unlock premium themes.",
        variant: "destructive"
      })
      return
    }
    setSelectedTheme(themeId)
    toast({
      title: "Theme applied",
      description: `Switched to ${theme?.name} theme.`
    })
  }

  const editorFonts = [
    { value: "courier", label: "Courier New", isPro: false },
    { value: "courier-prime", label: "Courier Prime", isPro: false },
    { value: "monaco", label: "Monaco", isPro: true },
    { value: "consolas", label: "Consolas", isPro: true },
    { value: "source-code", label: "Source Code Pro", isPro: true },
    { value: "jetbrains", label: "JetBrains Mono", isPro: true }
  ]

  const uiFonts = [
    { value: "inter", label: "Inter", isPro: false },
    { value: "system", label: "System Default", isPro: false },
    { value: "roboto", label: "Roboto", isPro: true },
    { value: "open-sans", label: "Open Sans", isPro: true },
    { value: "lato", label: "Lato", isPro: true }
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <Monitor className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Color Mode</CardTitle>
              <CardDescription>
                Choose how the application looks
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setColorMode("light")}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                colorMode === "light"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
              }`}
            >
              <Sun className="h-6 w-6" />
              <span className="text-sm font-medium">Light</span>
            </button>
            <button
              onClick={() => setColorMode("dark")}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                colorMode === "dark"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
              }`}
            >
              <Moon className="h-6 w-6" />
              <span className="text-sm font-medium">Dark</span>
            </button>
            <button
              onClick={() => setColorMode("system")}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                colorMode === "system"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
              }`}
            >
              <Monitor className="h-6 w-6" />
              <span className="text-sm font-medium">System</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Palette className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <CardTitle>Color Themes</CardTitle>
                {!isPro && (
                  <Badge variant="secondary" className="gap-1">
                    <Crown className="h-3 w-3" />
                    Pro
                  </Badge>
                )}
              </div>
              <CardDescription>
                Choose from our curated color themes {!isPro && "(Pro themes require upgrade)"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleThemeSelect(theme.id)}
                disabled={theme.requiresPro && !isPro}
                className={`relative flex flex-col p-4 rounded-lg border-2 transition-all ${
                  selectedTheme === theme.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                } ${
                  theme.requiresPro && !isPro
                    ? "opacity-60 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                {theme.requiresPro && (
                  <Badge variant="secondary" className="absolute top-2 right-2 gap-1">
                    <Crown className="h-3 w-3" />
                    Pro
                  </Badge>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex gap-1">
                    <div
                      className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: theme.preview.primary }}
                    />
                    <div
                      className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: theme.preview.secondary }}
                    />
                    <div
                      className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: theme.preview.accent }}
                    />
                  </div>
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">{theme.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {theme.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
          {!isPro && (
            <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900">
              <div className="flex items-start gap-2">
                <Crown className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Unlock Premium Themes
                  </p>
                  <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
                    Upgrade to Pro to access 5 additional professionally designed themes
                  </p>
                  <Button variant="default" size="sm" className="mt-2">
                    Upgrade to Pro
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <Type className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Typography</CardTitle>
              <CardDescription>
                Customize fonts for editor and interface
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="editorFont">Editor Font</Label>
            <Select value={editorFont} onValueChange={setEditorFont}>
              <SelectTrigger id="editorFont">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editorFonts.map((font) => (
                  <SelectItem
                    key={font.value}
                    value={font.value}
                    disabled={font.isPro && !isPro}
                  >
                    <div className="flex items-center gap-2">
                      <span>{font.label}</span>
                      {font.isPro && (
                        <Badge variant="secondary" className="text-xs">
                          Pro
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Font used in the screenplay editor
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="uiFont">Interface Font</Label>
            <Select value={uiFont} onValueChange={setUiFont}>
              <SelectTrigger id="uiFont">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {uiFonts.map((font) => (
                  <SelectItem
                    key={font.value}
                    value={font.value}
                    disabled={font.isPro && !isPro}
                  >
                    <div className="flex items-center gap-2">
                      <span>{font.label}</span>
                      {font.isPro && (
                        <Badge variant="secondary" className="text-xs">
                          Pro
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Font used throughout the interface
            </p>
          </div>

          <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
            <Label htmlFor="lineHeight">Editor Line Height</Label>
            <Select value={editorLineHeight} onValueChange={setEditorLineHeight}>
              <SelectTrigger id="lineHeight">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1.4">Compact (1.4)</SelectItem>
                <SelectItem value="1.6">Normal (1.6)</SelectItem>
                <SelectItem value="1.8">Comfortable (1.8)</SelectItem>
                <SelectItem value="2.0">Spacious (2.0)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Adjust line spacing in the editor for better readability
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-2">
              <Layout className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle>Layout Preferences</CardTitle>
              <CardDescription>
                Customize how content is displayed
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sidebarPosition">Sidebar Position</Label>
            <Select defaultValue="left">
              <SelectTrigger id="sidebarPosition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editorWidth">Editor Max Width</Label>
            <Select defaultValue="full">
              <SelectTrigger id="editorWidth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">Narrow (800px)</SelectItem>
                <SelectItem value="medium">Medium (1000px)</SelectItem>
                <SelectItem value="wide">Wide (1200px)</SelectItem>
                <SelectItem value="full">Full Width</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
