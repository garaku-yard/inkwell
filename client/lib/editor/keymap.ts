import type React from "react"

/**
 * Generic keyboard primitives shared by every format editor's keymap.
 *
 * Three things live here:
 *   1. getKeyString — canonical "mod+shift+a" string with the
 *      cross-platform Mod token resolving to Cmd on Mac and Ctrl
 *      elsewhere.
 *   2. dispatchKey — looks up a handler from a keymap object and
 *      invokes it with a caller-supplied context.
 *   3. Low-level helpers for the rules every contentEditable-backed
 *      editor ends up rewriting: empty check, start/end-of-element
 *      check, and a double-tap detector factory.
 *
 * Format-specific bindings (screenplay's number-key shortcuts, comic's
 * SMART_NEXT, etc.) live next to their editor — they're tied to the
 * editor's element-type vocabulary and rotate independently of this
 * engine. See `components/editor/screenplay/keymap.ts` for the
 * canonical example.
 */

/** True on Apple platforms where Cmd is the primary modifier. Browsers
 *  expose `metaKey` for Cmd on Mac and the Win key on Windows; we want
 *  the former to count as "Mod" but not the latter. */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPad|iPhone|iPod/.test(navigator.platform)
}

/** Builds a canonical key string with the cross-platform "mod" modifier
 *  collapsing Cmd-on-Mac and Ctrl-elsewhere into a single token. Modifier
 *  order is fixed (mod, shift, alt) so callers building keymap entries
 *  don't need to think about ordering. */
export function getKeyString(e: React.KeyboardEvent): string {
  const mac = isMacPlatform()
  const mod = mac ? e.metaKey : e.ctrlKey
  let key = e.key.toLowerCase()
  if (mod) key = `mod+${key}`
  if (e.shiftKey) key = `shift+${key}`
  if (e.altKey) key = `alt+${key}`
  return key
}

/** Generic shape of a keymap: keys are the strings produced by
 *  getKeyString, values are handlers that receive the event plus
 *  whatever context the caller threads through. Each editor narrows
 *  TContext to its own domain (element id + scene flag + element type
 *  for screenplay; just element id for simpler editors). */
export type Keymap<TContext> = Record<
  string,
  (e: React.KeyboardEvent<HTMLDivElement>, ctx: TContext) => void
>

/** Looks up a handler for the current event in `keymap` and invokes
 *  it. Returns true if a handler ran, false otherwise — useful when
 *  the editor wants to fall through to default browser behaviour. */
export function dispatchKey<TContext>(
  e: React.KeyboardEvent<HTMLDivElement>,
  keymap: Keymap<TContext>,
  ctx: TContext,
): boolean {
  const handler = keymap[getKeyString(e)]
  if (!handler) return false
  handler(e, ctx)
  return true
}

// ─── Selection / element-state helpers ──────────────────────────────

/** True when the contentEditable element is visually empty. Treats
 *  both `""` and the lone `<br>` browsers insert when you delete the
 *  last character as empty — the latter would otherwise let the user
 *  see what looks like an empty bullet that backspace refuses to
 *  delete. */
export function isElementEmpty(el: HTMLElement): boolean {
  const html = el.innerHTML
  return html === "" || html === "<br>"
}

/** True when the caret is at the start of `el`. Handles three shapes:
 *  selection on the element itself, selection on its first text node,
 *  and the empty-element edge case where textContent is zero-length. */
export function isCaretAtElementStart(
  range: Range,
  el: HTMLElement,
): boolean {
  return (
    range.startOffset === 0 &&
    (range.startContainer === el ||
      range.startContainer === el.firstChild ||
      el.textContent?.length === 0)
  )
}

/** True when the caret is collapsed at the end of `el`. Mirrors
 *  isCaretAtElementStart for the closing edge. */
export function isCaretAtElementEnd(
  range: Range,
  el: HTMLElement,
): boolean {
  if (!range.collapsed) return false
  const textLength = el.textContent?.length || 0
  return (
    range.endOffset === textLength ||
    (range.endContainer === el.lastChild &&
      range.endOffset === (range.endContainer.textContent?.length || 0)) ||
    textLength === 0
  )
}

// ─── Double-tap detector ────────────────────────────────────────────

export interface DoubleTapDetector {
  /** Schedule a single-tap action and report whether this call
   *  completed a double-tap. When it returns true the caller should
   *  fire its double-tap handler instead — the queued single-tap from
   *  the previous press has been cancelled. */
  scheduleOrDoubleTap: (onSingleTap: () => void) => boolean
  /** Cancel any pending single-tap without firing it. Useful on
   *  unmount or when a different handler short-circuits the gesture. */
  cancel: () => void
}

/** Returns a fresh double-tap detector. Each call captures its own
 *  closure state so two simultaneous editor mounts can't share a
 *  timer — a tap in one tab can no longer cancel a pending insert in
 *  the other. The classic use is screenplay's Enter handler:
 *  single-Enter inserts a sibling, double-Enter starts a new scene. */
export function createDoubleTapDetector(thresholdMs: number): DoubleTapDetector {
  let lastTime = 0
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  return {
    cancel,
    scheduleOrDoubleTap(onSingleTap) {
      const now = Date.now()
      const isDouble = now - lastTime < thresholdMs
      lastTime = now

      if (isDouble) {
        cancel()
        return true
      }

      cancel()
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null
        onSingleTap()
      }, thresholdMs)
      return false
    },
  }
}
