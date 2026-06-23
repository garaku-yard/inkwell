"use client"

import { useEffect, useState } from "react"
import { Maximize2, Minus, Square, X } from "lucide-react"
import { isTauri } from "@tauri-apps/api/core"

import { cn } from "@/lib/utils"

/** Root `<html>` class toggled by the titlebar so global CSS can flatten
 *  border-radius + remove the frame outline when the window is maximised. */
const MAXIMISED_CLASS = "window-maximised"

/**
 * Custom window titlebar shown in place of the OS chrome. Rendered only
 * under Tauri (detected at runtime) — the web build returns null so the
 * browser chrome stays intact.
 *
 * Layout:
 *
 *   [app name]  [───── drag region ─────]  [min]  [max]  [close]
 *
 * Drag region uses `data-tauri-drag-region`, the contract Tauri exposes
 * for "click-drag to move the window." Window controls call into
 * `getCurrentWindow()` — permissions are granted in `capabilities/default.json`.
 *
 * Theming piggybacks on Inkwell's CSS variables, so the titlebar follows
 * light/dark mode alongside the rest of the UI — the whole reason we
 * left the native chrome behind.
 */
export function WindowTitlebar() {
  const [mounted, setMounted] = useState(false)
  const [tauri, setTauri] = useState(false)
  const [maximised, setMaximised] = useState(false)

  // Tauri detection runs client-side only; isTauri() hits `window`.
  useEffect(() => {
    setMounted(true)
    const inTauri = isTauri()
    setTauri(inTauri)
    if (!inTauri) return

    let unlisten: (() => void) | undefined
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      const win = getCurrentWindow()
      setMaximised(await win.isMaximized())
      // Resize fires on both maximise and unmaximise; re-query state.
      unlisten = await win.onResized(async () => {
        setMaximised(await win.isMaximized())
      })
    })()
    return () => {
      unlisten?.()
    }
  }, [])

  // Tag the root so `globals.css` can flatten the border-radius when the
  // window is edge-to-edge. Only runs on the client under Tauri; the web
  // build never adds the class.
  useEffect(() => {
    if (!tauri) return
    const el = document.documentElement
    if (maximised) el.classList.add(MAXIMISED_CLASS)
    else el.classList.remove(MAXIMISED_CLASS)
  }, [tauri, maximised])

  if (!mounted || !tauri) return null

  const onMinimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().minimize()
  }
  const onToggleMaximise = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().toggleMaximize()
  }
  const onClose = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().close()
  }

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b bg-background"
    >
      {/* No brand mark here on purpose: the page header right below carries the
          full nib + wordmark lockup, so a mark in this strip would stack the nib
          twice in a tiny span. The titlebar stays a quiet drag region + window
          controls; window identity comes from the OS taskbar icon. */}
      <div data-tauri-drag-region className="flex-1" />
      <div className="flex items-center gap-1 px-2">
        <TitlebarButton onClick={onMinimize} title="Minimize">
          <Minus className="h-3 w-3" />
        </TitlebarButton>
        <TitlebarButton onClick={onToggleMaximise} title={maximised ? "Restore" : "Maximize"}>
          {maximised ? (
            <Square className="h-2.5 w-2.5" />
          ) : (
            <Maximize2 className="h-2.5 w-2.5" />
          )}
        </TitlebarButton>
        <TitlebarButton onClick={onClose} title="Close" destructive>
          <X className="h-3 w-3" />
        </TitlebarButton>
      </div>
    </div>
  )
}

function TitlebarButton({
  onClick,
  title,
  destructive,
  children,
}: {
  onClick: () => void
  title: string
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        // Quiet by default — no border or fill at rest, just a muted glyph that
        // reveals a subtle background on hover. Matches the "quiet craft"
        // register instead of three filled traffic-light circles.
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors",
        destructive
          ? "hover:bg-destructive hover:text-white"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
