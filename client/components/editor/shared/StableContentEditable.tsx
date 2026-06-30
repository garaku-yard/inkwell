"use client"

/**
 * Cursor-stable contentEditable primitive.
 *
 * Why this exists: rendering `<div contentEditable>{value}</div>` with a
 * React-managed string child causes React to reconcile the DOM children
 * on every keystroke, which collapses the user's selection back to the
 * start of the element. The result: typing into the field appears
 * "backwards." This primitive sidesteps the problem by managing the
 * contentEditable's content imperatively via a ref:
 *
 *   - on mount, write the initial `value` to the DOM
 *   - on `value` prop change, sync to the DOM ONLY when the element
 *     isn't focused (so prop updates from autosave or template loading
 *     still propagate, but they never fight the user's cursor)
 *   - on user input, emit the new content via `onValueChange` without
 *     re-rendering the children
 *
 * The screenplay's EditableElement was the only editor that already
 * did this dance; this primitive extracts the mechanics so every
 * format editor can drop in without duplicating ~30 lines of
 * useEffect + ref bookkeeping.
 *
 * Two layers ship from this file (Radix-style):
 *
 *   1. useStableContentEditable — the hook. Use it when you need to
 *      compose the contentEditable with siblings that need a ref to
 *      the same DOM node (e.g. the screenplay's autocomplete
 *      popovers).
 *
 *   2. <StableContentEditable /> — wrapper component built on top of
 *      the hook. Use it as a drop-in replacement for any
 *      `<div contentEditable suppressContentEditableWarning ...>` in
 *      the simpler format editors. Standard div props (className,
 *      onKeyDown, data-*, aria-*) pass through; only `value` and
 *      `onValueChange` are special.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type FormEvent,
  type HTMLAttributes,
} from "react"

/** What the primitive stores in the DOM:
 *   - "text" → textContent (plain). Pastes/typed input lose formatting,
 *     which is what the prose-shaped editors want.
 *   - "html" → innerHTML (rich). Used by screenplay so bold/italic
 *     runs survive a save/load round-trip. */
export type StableContentEditableMode = "text" | "html"

/** The imperative handle exposed via ref. Methods are no-ops before
 *  the element has mounted, so callers can fire them in event handlers
 *  without null-checking. */
export interface StableContentEditableHandle {
  /** Focus the element without moving the caret. */
  focus(): void
  /** Focus and place the caret at the end of the existing content. */
  focusAtEnd(): void
  /** Programmatically replace the content. Use this for autocomplete
   *  acceptance, template loading, or any flow that mutates the
   *  document outside of the typing path. Updates the internal
   *  "last synced" baseline so a subsequent prop sync doesn't undo it. */
  setContent(value: string): void
  /** Read the current content from the DOM in the configured mode. */
  getContent(): string
  /** The underlying DOM node, or null before mount. Useful for
   *  composing with sibling components that need to position
   *  themselves relative to it (autocomplete popovers, comment pins). */
  element: HTMLDivElement | null
}

interface UseStableContentEditableOptions {
  value: string
  onValueChange: (next: string) => void
  mode?: StableContentEditableMode
}

interface UseStableContentEditableResult {
  /** Attach to the contentEditable element. */
  ref: React.RefObject<HTMLDivElement | null>
  /** Spread these handlers + attributes onto the contentEditable.
   *  Consumers should still spread their own className / data-* etc. */
  contentEditableProps: {
    contentEditable: true
    suppressContentEditableWarning: true
    role: "textbox"
    "aria-multiline": "true"
    onInput: (e: FormEvent<HTMLDivElement>) => void
    onFocus: (e: FormEvent<HTMLDivElement>) => void
    onBlur: (e: FormEvent<HTMLDivElement>) => void
  }
  /** Imperative methods. Same shape as the component's ref. */
  handle: StableContentEditableHandle
}

/** Read the DOM in the requested mode. Centralised so the read and
 *  write paths can't disagree on which property to use. */
function readContent(el: HTMLElement, mode: StableContentEditableMode): string {
  return mode === "html" ? el.innerHTML : (el.textContent ?? "")
}

/** Write the DOM in the requested mode. Caller is responsible for
 *  updating any "last synced" baseline. */
function writeContent(el: HTMLElement, value: string, mode: StableContentEditableMode): void {
  if (mode === "html") {
    el.innerHTML = value
  } else {
    el.textContent = value
  }
}

/** Place the caret at the end of `el`'s contents, leaving a collapsed
 *  selection. No-op when the document has no selection (SSR, headless
 *  environments). */
function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * The hook. Wires up the cursor-stable mechanics around a div ref and
 * returns the spread-ready props plus an imperative handle. Use it
 * directly when you need the bare contentEditable element exposed to
 * sibling components (autocomplete popovers etc.); use the wrapper
 * component for everything else.
 */
export function useStableContentEditable({
  value,
  onValueChange,
  mode = "text",
}: UseStableContentEditableOptions): UseStableContentEditableResult {
  const ref = useRef<HTMLDivElement | null>(null)
  const lastSyncedValue = useRef<string>(value)
  const isMountedRef = useRef(false)
  const isFocusedRef = useRef(false)
  // Hold the latest onValueChange in a ref so the onInput handler is
  // a stable identity. Otherwise consumers that pass a fresh function
  // every render would force the contentEditable to rebind its
  // listener on every keystroke (cheap, but unnecessary).
  const onChangeRef = useRef(onValueChange)
  onChangeRef.current = onValueChange

  // Initial-mount sync. Runs exactly once. We deliberately use the
  // empty deps array because subsequent value changes are handled by
  // the focus-aware sync effect below; collapsing both into one effect
  // would force us to track "is this the first render" with another
  // ref, which is the bookkeeping we just deleted.
  useEffect(() => {
    if (ref.current) {
      writeContent(ref.current, value, mode)
      lastSyncedValue.current = value
    }
    isMountedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External-update sync. Skips if:
  //  (a) the element is currently focused (user is typing — clobbering
  //      their content would yank their caret), or
  //  (b) the new prop equals the value we last wrote to the DOM
  //      (avoids a write loop where onInput → setState → prop change
  //      → useEffect → DOM write → DOM mutation event).
  useEffect(() => {
    if (!isMountedRef.current) return
    if (!ref.current) return
    // Protect the caret only while the element is focused AND its window has
    // focus. A focused element in a background window (e.g. the other pane in a
    // side-by-side co-editing session) is not being typed into, so it should
    // still pick up external value changes (a collaborator's live edit) instead
    // of going stale until the user clicks away.
    if (isFocusedRef.current && typeof document !== "undefined" && document.hasFocus()) return
    if (lastSyncedValue.current === value) return
    writeContent(ref.current, value, mode)
    lastSyncedValue.current = value
  }, [value, mode])

  const handleInput = useCallback(
    (e: FormEvent<HTMLDivElement>) => {
      const next = readContent(e.currentTarget, mode)
      lastSyncedValue.current = next
      onChangeRef.current(next)
    },
    [mode],
  )

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true
  }, [])

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false
  }, [])

  // Build the imperative handle every render so methods always close
  // over the latest mode. Methods are short and allocation here is
  // negligible compared to a typing keystroke's React render.
  const handle: StableContentEditableHandle = {
    focus() {
      ref.current?.focus()
    },
    focusAtEnd() {
      const el = ref.current
      if (!el) return
      el.focus()
      // Defer caret placement to next frame so the focus settles
      // before we ask for a selection range — some browsers reject
      // the range otherwise.
      requestAnimationFrame(() => {
        if (ref.current) placeCaretAtEnd(ref.current)
      })
    },
    setContent(next) {
      const el = ref.current
      if (!el) return
      writeContent(el, next, mode)
      lastSyncedValue.current = next
      onChangeRef.current(next)
    },
    getContent() {
      const el = ref.current
      if (!el) return ""
      return readContent(el, mode)
    },
    get element() {
      return ref.current
    },
  }

  return {
    ref,
    contentEditableProps: {
      contentEditable: true,
      suppressContentEditableWarning: true,
      role: "textbox",
      "aria-multiline": "true",
      onInput: handleInput,
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
    handle,
  }
}

// ─── Component sugar ─────────────────────────────────────────────────

/** Standard div props minus the ones the primitive owns. We strip
 *  `children` because content is managed via the value prop, not via
 *  JSX children — passing children would trigger the exact React
 *  reconciliation bug we're trying to avoid. */
type DivPassthroughProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  | "contentEditable"
  | "suppressContentEditableWarning"
  | "role"
  | "aria-multiline"
  | "onInput"
  | "children"
>

export interface StableContentEditableProps extends DivPassthroughProps {
  /** Source of truth for the contentEditable's content. Updates from
   *  outside the element (autosave reload, template insertion, passage
   *  switch) flow through this prop and reach the DOM only when the
   *  element isn't focused. */
  value: string
  /** Fired on every user input with the new content (text or html
   *  depending on mode). Programmatic updates via the imperative
   *  handle's setContent also call this. */
  onValueChange: (next: string) => void
  /** Storage mode. Defaults to "text" which is what every editor
   *  except screenplay wants. */
  mode?: StableContentEditableMode
}

/**
 * Drop-in cursor-stable contentEditable. Replace existing
 * `<div contentEditable suppressContentEditableWarning ...>{value}</div>`
 * call sites with `<StableContentEditable value={value} onValueChange={...} ... />`
 * and the cursor-jump bug goes away.
 *
 * Pass a ref typed as `StableContentEditableHandle` to call
 * `focus`/`focusAtEnd`/`setContent`/`getContent` imperatively, or to
 * read the underlying DOM node via `.element` (e.g. for an
 * autocomplete popover that needs to position itself).
 */
export const StableContentEditable = forwardRef<
  StableContentEditableHandle,
  StableContentEditableProps
>(function StableContentEditable(
  { value, onValueChange, mode = "text", onFocus, onBlur, ...rest },
  forwardedRef,
) {
  const { ref, contentEditableProps, handle } = useStableContentEditable({
    value,
    onValueChange,
    mode,
  })
  useImperativeHandle(forwardedRef, () => handle, [handle])

  // Compose the primitive's focus/blur tracking with any handlers the
  // consumer also passed in. Consumer handlers run AFTER the primitive
  // updates its internal state, so they see the post-state isFocused
  // flag — usually what callers want.
  const composedFocus = useCallback(
    (e: FormEvent<HTMLDivElement>) => {
      contentEditableProps.onFocus(e)
      onFocus?.(e as unknown as React.FocusEvent<HTMLDivElement>)
    },
    [contentEditableProps, onFocus],
  )
  const composedBlur = useCallback(
    (e: FormEvent<HTMLDivElement>) => {
      contentEditableProps.onBlur(e)
      onBlur?.(e as unknown as React.FocusEvent<HTMLDivElement>)
    },
    [contentEditableProps, onBlur],
  )

  // If the consumer passed `data-placeholder` we mirror it to
  // `aria-placeholder` so screen readers announce the prompt. The
  // explicit aria-placeholder prop wins if both are present.
  const dataPlaceholder = (rest as Record<string, unknown>)["data-placeholder"]
  const ariaPlaceholder =
    typeof rest["aria-placeholder"] === "string"
      ? rest["aria-placeholder"]
      : typeof dataPlaceholder === "string"
        ? dataPlaceholder
        : undefined

  return (
    <div
      {...rest}
      ref={ref}
      contentEditable={contentEditableProps.contentEditable}
      suppressContentEditableWarning={
        contentEditableProps.suppressContentEditableWarning
      }
      role={contentEditableProps.role}
      aria-multiline={contentEditableProps["aria-multiline"]}
      aria-placeholder={ariaPlaceholder}
      onInput={contentEditableProps.onInput}
      onFocus={composedFocus}
      onBlur={composedBlur}
    />
  )
})
