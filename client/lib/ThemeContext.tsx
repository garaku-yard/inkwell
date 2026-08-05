"use client"

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react"

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

/** One pref per editor type. Each format has its own typographic
 *  conventions — screenplay locks to Courier, comic scripts run mono,
 *  prose-shaped editors look better in serif — so storing a single
 *  global "editor font" was a poor fit. Per-kind prefs let users
 *  override format conventions without dragging every editor along. */
export type EditorKind =
  | "screenplay"
  | "prose"
  | "poetry"
  | "comic"
  | "ttrpg"
  | "if"
  | "vault"

export const EDITOR_KIND_LABEL: Record<EditorKind, string> = {
  screenplay: "Screenplay",
  prose: "Prose & Memoir",
  poetry: "Poetry & Lyrics",
  comic: "Comic Script",
  ttrpg: "Tabletop RPG",
  if: "Interactive Fiction",
  vault: "Vault (Markdown)",
}

/** Format-conventional defaults. New users see typography that
 *  matches each format's industry expectations. */
/** What every user had under the old single-font schema, chosen or not. */
const LEGACY_EDITOR_FONT_DEFAULT = "courier"

const EDITOR_FONT_DEFAULTS: Record<EditorKind, string> = {
  screenplay: "courier",
  comic: "courier",
  prose: "lora",
  poetry: "lora",
  ttrpg: "lora",
  if: "inter",
  vault: "inter",
}

export interface AppearancePrefs {
  colorMode: ColorMode
  theme: ThemeName
  /** Per-editor font picks. Each value is a font ID from EDITOR_FONTS. */
  editorFonts: Record<EditorKind, string>
  uiFont: string
  editorLineHeight: string
  // ── Accessibility ── applied globally to <html> alongside the theme so
  // they take effect on every route, not just the settings page.
  /** Strengthen text/border contrast (adds `html.high-contrast`). */
  highContrast: boolean
  /** Near-disable animations + transitions (adds `html.reduce-motion`). */
  reduceMotion: boolean
  /** Looser letter/word/line spacing for easier reading (`html.readable-text`). */
  readableText: boolean
  /** Whole-UI zoom as a percentage of the root font size (80–150). */
  interfaceScale: number
}

/** The subset of prefs owned by the Accessibility settings section. */
export type AccessibilityPrefs = Pick<
  AppearancePrefs,
  "highContrast" | "reduceMotion" | "readableText" | "interfaceScale"
>

const DEFAULTS: AppearancePrefs = {
  colorMode: "system",
  theme: "forest",
  editorFonts: EDITOR_FONT_DEFAULTS,
  uiFont: "inter",
  editorLineHeight: "1.6",
  highContrast: false,
  reduceMotion: false,
  readableText: false,
  interfaceScale: 100,
}

/** Font-family stacks shared by both UI and editor pickers. The
 *  `--font-*` variables are injected by `next/font/google`
 *  declarations in `app/layout.tsx`. System-only fonts (Courier New,
 *  Monaco, Consolas, system-ui, Georgia) skip the variable because
 *  they're guaranteed installed on the corresponding OS. */
const FONT_STACKS: Record<string, string> = {
  // Sans / UI
  inter: "var(--font-inter), Inter, system-ui, sans-serif",
  system: "system-ui, sans-serif",
  roboto: "var(--font-roboto), Roboto, system-ui, sans-serif",
  "open-sans": "var(--font-open-sans), 'Open Sans', system-ui, sans-serif",
  lato: "var(--font-lato), Lato, system-ui, sans-serif",
  // Serif (long-form reading)
  lora: "var(--font-lora), Lora, Georgia, 'Times New Roman', serif",
  merriweather: "var(--font-merriweather), Merriweather, Georgia, serif",
  georgia: "Georgia, 'Times New Roman', serif",
  // Mono
  courier: "'Courier New', Courier, monospace",
  "courier-prime": "var(--font-courier-prime), 'Courier Prime', 'Courier New', monospace",
  monaco: "Monaco, 'Courier New', monospace",
  consolas: "Consolas, 'Courier New', monospace",
  "source-code": "var(--font-source-code), 'Source Code Pro', Menlo, monospace",
  jetbrains: "var(--font-jetbrains), 'JetBrains Mono', Menlo, monospace",
}

/** Resolve a font id to its CSS font-family stack. Falls back to a
 *  sensible system stack when the id isn't recognised — keeps the
 *  app from rendering blank if a stale localStorage entry survives a
 *  rename. */
export function getFontStack(fontId: string): string {
  return FONT_STACKS[fontId] ?? FONT_STACKS.inter
}

/** Picker categories — the Settings UI groups options for clarity. */
export const SANS_FONT_OPTIONS = [
  { value: "inter",      label: "Inter" },
  { value: "system",     label: "System Default" },
  { value: "roboto",     label: "Roboto" },
  { value: "open-sans",  label: "Open Sans" },
  { value: "lato",       label: "Lato" },
] as const

export const SERIF_FONT_OPTIONS = [
  { value: "lora",          label: "Lora" },
  { value: "merriweather",  label: "Merriweather" },
  { value: "georgia",       label: "Georgia (system)" },
] as const

export const MONO_FONT_OPTIONS = [
  { value: "courier",       label: "Courier New" },
  { value: "courier-prime", label: "Courier Prime" },
  { value: "monaco",        label: "Monaco" },
  { value: "consolas",      label: "Consolas" },
  { value: "source-code",   label: "Source Code Pro" },
  { value: "jetbrains",     label: "JetBrains Mono" },
] as const

/** Every font option, flattened — used as the editor-font picker
 *  source so writers can mix categories (e.g. JetBrains for prose). */
export const ALL_EDITOR_FONT_OPTIONS = [
  { group: "Serif", options: SERIF_FONT_OPTIONS },
  { group: "Sans",  options: SANS_FONT_OPTIONS },
  { group: "Mono",  options: MONO_FONT_OPTIONS },
] as const

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
  // UI font applies globally; editor fonts are set per-wrapper by
  // each editor's render so different routes can render different
  // typography simultaneously.
  root.style.setProperty("--inkwell-ui-font", getFontStack(prefs.uiFont))
  root.style.setProperty("--inkwell-editor-lh", prefs.editorLineHeight)
  // Accessibility classes — globals.css carries the matching rules.
  root.classList.toggle("high-contrast", prefs.highContrast)
  root.classList.toggle("reduce-motion", prefs.reduceMotion)
  root.classList.toggle("readable-text", prefs.readableText)
  // Interface scale rides the root font size; Tailwind's rem units scale the
  // whole UI with it. 100% leaves the browser default untouched.
  root.style.fontSize = prefs.interfaceScale === 100 ? "" : `${prefs.interfaceScale}%`
}

interface ThemeContextType {
  prefs: AppearancePrefs
  setColorMode: (mode: ColorMode) => void
  setTheme: (theme: ThemeName) => void
  setEditorFontFor: (kind: EditorKind, font: string) => void
  /** Restore every format to its conventional default face. */
  resetEditorFonts: () => void
  setUiFont: (font: string) => void
  setEditorLineHeight: (lh: string) => void
  /** Patch one or more accessibility prefs; persists + applies immediately. */
  setAccessibility: (patch: Partial<AccessibilityPrefs>) => void
  /** Resolve the font-family stack for the given editor kind.
   *  Editors call this once per render to set their wrapper's
   *  fontFamily. */
  editorFontStack: (kind: EditorKind) => string
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
      const parsed = stored ? JSON.parse(stored) : null
      const loaded: AppearancePrefs = {
        ...DEFAULTS,
        ...(parsed ?? {}),
        // editorFonts merges the format-conventional defaults with
        // any user overrides — so a user who saved {"prose": "inter"}
        // before "ttrpg" was a kind still gets the ttrpg default,
        // not undefined.
        editorFonts: { ...EDITOR_FONT_DEFAULTS, ...(parsed?.editorFonts ?? {}) },
      }
      // Migrate the old single-editor-font shape into per-kind prefs: if the
      // user ever picked an editor font under the old schema, mirror it across
      // every kind so they don't lose their choice.
      //
      // Except when the stored value *is* the old default. Under the old schema
      // everyone had "courier" whether they chose it or not, so mirroring it
      // turned "never touched this" into seven deliberate-looking picks and
      // buried the format conventions this panel promises — a prose manuscript
      // and an interactive fiction both silently rendering in a screenplay
      // typewriter face. A non-choice should fall through to the defaults.
      if (
        parsed &&
        typeof parsed.editorFont === "string" &&
        parsed.editorFont !== LEGACY_EDITOR_FONT_DEFAULT &&
        !parsed.editorFonts
      ) {
        for (const kind of Object.keys(EDITOR_FONT_DEFAULTS) as EditorKind[]) {
          loaded.editorFonts[kind] = parsed.editorFont
        }
      }
      // Migrate old standalone "theme" key (light/dark)
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
  const setEditorFontFor = useCallback((kind: EditorKind, font: string) => {
    setPrefs((prev) => {
      const next: AppearancePrefs = {
        ...prev,
        editorFonts: { ...prev.editorFonts, [kind]: font },
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      applyPrefs(next)
      return next
    })
  }, [])
  /** Put every format back on its conventional face. The escape hatch for
   *  prefs the old migration already flattened — there is no way to tell those
   *  apart from seven deliberate picks, so the writer says which it was. */
  const resetEditorFonts = useCallback(
    () => update({ editorFonts: { ...EDITOR_FONT_DEFAULTS } }),
    [update],
  )

  const setUiFont = useCallback((uiFont: string) => update({ uiFont }), [update])
  const setEditorLineHeight = useCallback((editorLineHeight: string) => update({ editorLineHeight }), [update])
  const setAccessibility = useCallback((patch: Partial<AccessibilityPrefs>) => update(patch), [update])
  const editorFontStack = useCallback(
    (kind: EditorKind) => getFontStack(prefs.editorFonts[kind] ?? EDITOR_FONT_DEFAULTS[kind]),
    [prefs.editorFonts],
  )

  const toggleTheme = useCallback(() => {
    const current = prefs.colorMode === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : prefs.colorMode
    setColorMode(current === "dark" ? "light" : "dark")
  }, [prefs.colorMode, setColorMode])

  const resolvedTheme: "light" | "dark" = mounted
    ? (document.documentElement.classList.contains("dark") ? "dark" : "light")
    : "light"

  // Memoised so a prefs change (e.g. dragging the line-height slider) doesn't
  // hand every useTheme consumer a new object and re-render the whole tree.
  const value = useMemo<ThemeContextType>(
    () => ({
      prefs,
      setColorMode,
      setTheme,
      setEditorFontFor,
      resetEditorFonts,
      setUiFont,
      setEditorLineHeight,
      setAccessibility,
      editorFontStack,
      theme: resolvedTheme,
      toggleTheme,
    }),
    [prefs, setColorMode, setTheme, setEditorFontFor, setUiFont, setEditorLineHeight, setAccessibility, editorFontStack, resolvedTheme, toggleTheme],
  )

  if (!mounted) return <>{children}</>

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>

}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
