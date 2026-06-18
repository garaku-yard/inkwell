"use client"

import { Contrast, Zap, Maximize2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { useTheme } from "@/lib/ThemeContext"

export function AccessibilitySection() {
  const { prefs, setAccessibility } = useTheme()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <Contrast className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Visual Accessibility</CardTitle>
              <CardDescription>
                Adjust visual settings for better readability
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="highContrast">High Contrast Mode</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Strengthen text and borders for better visibility
              </p>
            </div>
            <Switch
              id="highContrast"
              checked={prefs.highContrast}
              onCheckedChange={(v) => setAccessibility({ highContrast: v })}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              <Label htmlFor="readableText">Readable Text Spacing</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Increase letter, word, and line spacing for easier reading
              </p>
            </div>
            <Switch
              id="readableText"
              checked={prefs.readableText}
              onCheckedChange={(v) => setAccessibility({ readableText: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Motion &amp; Animation</CardTitle>
              <CardDescription>
                Control animations and motion effects
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="reduceMotion">Reduce Motion</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Minimize animations and transitions throughout the app
              </p>
            </div>
            <Switch
              id="reduceMotion"
              checked={prefs.reduceMotion}
              onCheckedChange={(v) => setAccessibility({ reduceMotion: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <Maximize2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Interface Scale</CardTitle>
              <CardDescription>
                Scale the whole interface up or down
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="uiScale">Interface Scale</Label>
              <span className="text-sm font-medium tabular-nums">{prefs.interfaceScale}%</span>
            </div>
            <Slider
              id="uiScale"
              min={80}
              max={150}
              step={10}
              value={[prefs.interfaceScale]}
              onValueChange={([v]) => setAccessibility({ interfaceScale: v })}
            />
            <p className="text-sm text-muted-foreground">
              Scales every UI element. Takes effect immediately across the app.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keyboard Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900 p-4">
            <h4 className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">
              Essential Keyboard Shortcuts
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-blue-800 dark:text-blue-200">
                <span>Navigate settings sections</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700 font-mono text-xs">
                  Tab
                </kbd>
              </div>
              <div className="flex justify-between text-blue-800 dark:text-blue-200">
                <span>Toggle switches</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700 font-mono text-xs">
                  Space
                </kbd>
              </div>
              <div className="flex justify-between text-blue-800 dark:text-blue-200">
                <span>Activate buttons</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700 font-mono text-xs">
                  Enter
                </kbd>
              </div>
              <div className="flex justify-between text-blue-800 dark:text-blue-200">
                <span>Open the shortcuts cheat sheet</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700 font-mono text-xs">
                  ?
                </kbd>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
