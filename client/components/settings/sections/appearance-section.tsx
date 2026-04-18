"use client"

import { Palette, Type, Layout, Monitor, Moon, Sun } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme, type ColorMode } from "@/lib/ThemeContext"
import { cn } from "@/lib/utils"

export function AppearanceSection() {
  const { prefs, setColorMode, setEditorFont, setUiFont, setEditorLineHeight } = useTheme()

  const colorModes: { id: ColorMode; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: "Light", icon: <Sun className="h-5 w-5" /> },
    { id: "dark",  label: "Dark",  icon: <Moon className="h-5 w-5" /> },
    { id: "system", label: "System", icon: <Monitor className="h-5 w-5" /> },
  ]

  const editorFonts = [
    { value: "courier",       label: "Courier New" },
    { value: "courier-prime", label: "Courier Prime" },
    { value: "monaco",        label: "Monaco" },
    { value: "consolas",      label: "Consolas" },
    { value: "source-code",   label: "Source Code Pro" },
    { value: "jetbrains",     label: "JetBrains Mono" },
  ]

  const uiFonts = [
    { value: "inter",      label: "Inter" },
    { value: "system",     label: "System Default" },
    { value: "roboto",     label: "Roboto" },
    { value: "open-sans",  label: "Open Sans" },
    { value: "lato",       label: "Lato" },
  ]

  return (
    <div className="space-y-6">
      {/* Color mode */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <Monitor className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Color Mode</CardTitle>
              <CardDescription>Choose how the application looks</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {colorModes.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setColorMode(id)}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors",
                  prefs.colorMode === id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80"
                )}
              >
                {icon}
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Color themes — not yet implemented */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Palette className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Color Themes</CardTitle>
              <CardDescription>Custom accent palettes — coming in a future release</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Badge variant="secondary" className="mb-3">Coming soon</Badge>
            <p>Ocean, Forest, Sunset, Midnight, and Rose palettes are designed and on the roadmap.</p>
          </div>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <Type className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Typography</CardTitle>
              <CardDescription>Customize fonts for the editor and interface</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="editorFont">Editor Font</Label>
            <Select value={prefs.editorFont} onValueChange={setEditorFont}>
              <SelectTrigger id="editorFont">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editorFonts.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Applied to all writing editors.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="uiFont">Interface Font</Label>
            <Select value={prefs.uiFont} onValueChange={setUiFont}>
              <SelectTrigger id="uiFont">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {uiFonts.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-4 border-t border-border">
            <Label htmlFor="lineHeight">Editor Line Height</Label>
            <Select value={prefs.editorLineHeight} onValueChange={setEditorLineHeight}>
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
          </div>
        </CardContent>
      </Card>

      {/* Layout — coming soon, sidebar and width don't have real hooks */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-2">
              <Layout className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle>Layout Preferences</CardTitle>
              <CardDescription>Sidebar position and editor width — coming in a future release</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Badge variant="secondary" className="mb-3">Coming soon</Badge>
            <p>Right-sidebar mode and editor width options will be configurable here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
