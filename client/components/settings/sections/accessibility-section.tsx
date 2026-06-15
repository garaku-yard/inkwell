"use client"

import { useState } from "react"
import { Contrast, Zap, Maximize2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function AccessibilitySection() {
  const [highContrast, setHighContrast] = useState(false)
  const [dyslexiaFont, setDyslexiaFont] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [fontSize, setFontSize] = useState([16])
  const [cursorSize, setCursorSize] = useState("normal")
  const [uiScale, setUiScale] = useState([100])

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
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Increase contrast for better visibility
              </p>
            </div>
            <Switch
              id="highContrast"
              checked={highContrast}
              onCheckedChange={setHighContrast}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
            <div>
              <Label htmlFor="dyslexiaFont">Dyslexia-Friendly Font</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Use OpenDyslexic font for easier reading
              </p>
            </div>
            <Switch
              id="dyslexiaFont"
              checked={dyslexiaFont}
              onCheckedChange={setDyslexiaFont}
            />
          </div>

          <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <Label htmlFor="fontSize">Editor Font Size</Label>
              <span className="text-sm font-medium">{fontSize[0]}px</span>
            </div>
            <Slider
              id="fontSize"
              min={12}
              max={24}
              step={1}
              value={fontSize}
              onValueChange={setFontSize}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Adjust the base font size in the editor
            </p>
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
              <CardTitle>Motion & Animation</CardTitle>
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
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Minimize animations and transitions throughout the app
              </p>
            </div>
            <Switch
              id="reduceMotion"
              checked={reduceMotion}
              onCheckedChange={setReduceMotion}
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
              <CardTitle>Interface Scaling</CardTitle>
              <CardDescription>
                Adjust cursor and UI element sizes
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="cursorSize">Cursor Size</Label>
            <Select value={cursorSize} onValueChange={setCursorSize}>
              <SelectTrigger id="cursorSize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="extra-large">Extra Large</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Increase cursor size for better visibility
            </p>
          </div>

          <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <Label htmlFor="uiScale">Interface Scale</Label>
              <span className="text-sm font-medium">{uiScale[0]}%</span>
            </div>
            <Slider
              id="uiScale"
              min={80}
              max={150}
              step={10}
              value={uiScale}
              onValueChange={setUiScale}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Scale all UI elements for easier interaction
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
                <span>Close dialogs</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700 font-mono text-xs">
                  Esc
                </kbd>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
