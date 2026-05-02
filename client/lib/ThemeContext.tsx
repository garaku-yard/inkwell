"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"

export type ColorMode = "light" | "dark" | "system"

/** Available accent palettes. Forest is the brand default — its values
 *  match the current `--primary` / `--ring` / `--link` tokens, so picking
 *  it produces the same UI users had before themes shipped. The other
 *  four (Ocean / Sunset / Midnight / Rose) override those three tokens
 *  in both light and dark variants. The warm-charcoal background stays
 *  the same across all themes; only the accent hue swaps. */
export type ThemeName = "forest" | "ocean" | "sunset" | "midnight" | "rose"

export const THEME_OPTIONS: { id: ThemeName; label: string; description: string }[] = [
  { id: "forest",   label: "Forest",   description: "Sage green — the Inkwell default" },
  { id: "ocean",    label: "Ocean",    description: "Cool teal accent on warm charcoal" },
  { id: "sunset",   label: "Sunset",   description: "Warm terracotta accent" },
  { id: "midnight", label: "Midnight", description: "Deep indigo accent" },
  { id: "rose",     label: "Rose",     description: "Dusty rose accent" },
]

export interface AppearancePrefs {
  colorMode: ColorMode
  theme: ThemeName
  editorFont: string
  uiFont: string
  editorLineHeight: string
}

const DEFAULTS: AppearancePrefs = {
  colorMode: "system",
  theme: "forest",
  editorFont: "courier",
  uiFont: "inter",
  editorLineHeight: "1.6",
}

const EDITOR_FONTS: Record<string, string> = {
  courier: "'Courier New', Courier, monospace",
  "courier-prime": "'Courier Prime', 'Courier New', monospace",
  monaco: "Monaco, 'Courier New', monospace",
  consolas: "Consolas, 'Courier New', monospace",
  "source-code": "'Source Code Pro', monospace",
  jetbrains: "'JetBrains Mono', monospace",
}

const UI_FONTS: Record<string, string> = {
  inter: "Inter, system-ui, sans-serif",
  system: "system-ui, sans-serif",
  roboto: "Roboto, system-ui, sans-serif",
  "open-sans": "'Open Sans', system-ui, sans-serif",
  lato: "Lato, system-ui, sans-serif",
}

const STORAGE_KEY = "inkwell:appearance"

function applyPrefs(prefs: AppearancePrefs) {
  const root = document.documentElement
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const dark = prefs.colorMode === "dark" || (prefs.colorMode === "system" && prefersDark)
  root.classList.toggle("dark", dark)
  // Theme rules in globals.css key off the data-theme attribute. The
  // default ("forest") clears it so the bare `:root` rules apply
  // unmodified — matches the look users had before themes shipped.
  if (prefs.theme === "forest") {
    root.removeAttribute("data-theme")
  } else {
    root.setAttribute("data-theme", prefs.theme)
  }
  root.style.setProperty("--inkwell-editor-font", EDITOR_FONTS[prefs.editorFont] ?? EDITOR_FONTS.courier)
  root.style.setProperty("--inkwell-ui-font", UI_FONTS[prefs.uiFont] ?? UI_FONTS.inter)
  root.style.setProperty("--inkwell-editor-lh", prefs.editorLineHeight)
}

interface ThemeContextType {
  prefs: AppearancePrefs
  setColorMode: (mode: ColorMode) => void
  setTheme: (theme: ThemeName) => void
  setEditorFont: (font: string) => void
  setUiFont: (font: string) => void
  setEditorLineHeight: (lh: string) => void
  // legacy compat
  theme: "light" | "dark"
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULTS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const loaded: AppearancePrefs = stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS
      // migrate old "theme" key
      const oldTheme = localStorage.getItem("theme") as "light" | "dark" | null
      if (!stored && oldTheme) loaded.colorMode = oldTheme
      setPrefs(loaded)
      applyPrefs(loaded)
    } catch {
      applyPrefs(DEFAULTS)
    }
  }, [])

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (!mounted) return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => { if (prefs.colorMode === "system") applyPrefs(prefs) }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [mounted, prefs])

  const update = useCallback((patch: Partial<AppearancePrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      applyPrefs(next)
      return next
    })
  }, [])

  const setColorMode = useCallback((mode: ColorMode) => update({ colorMode: mode }), [update])
  const setTheme = useCallback((theme: ThemeName) => update({ theme }), [update])
  const setEditorFont = useCallback((editorFont: string) => update({ editorFont }), [update])
  const setUiFont = useCallback((uiFont: string) => update({ uiFont }), [update])
  const setEditorLineHeight = useCallback((editorLineHeight: string) => update({ editorLineHeight }), [update])

  const toggleTheme = useCallback(() => {
    const current = prefs.colorMode === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : prefs.colorMode
    setColorMode(current === "dark" ? "light" : "dark")
  }, [prefs.colorMode, setColorMode])

  const resolvedTheme: "light" | "dark" = mounted
    ? (document.documentElement.classList.contains("dark") ? "dark" : "light")
    : "light"

  if (!mounted) return <>{children}</>

  return (
    <ThemeContext.Provider value={{
      prefs,
      setColorMode,
      setTheme,
      setEditorFont,
      setUiFont,
      setEditorLineHeight,
      theme: resolvedTheme,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
