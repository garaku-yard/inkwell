"use client"

import { useEffect, useRef } from "react"

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages as codeLanguages } from "@codemirror/language-data"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView, highlightActiveLine, keymap } from "@codemirror/view"

import {
  linkClickExtension,
  tagClickExtension,
  wikilinkClickExtension,
  wikilinkParser,
} from "./wikilinks"

import { livePreviewPlugin, vaultPathFacet } from "./live-preview"
import { inkwellTheme } from "./theme"

interface MarkdownEditorProps {
  /** Current document value. Treat this like a controlled textarea: pass
   *  state down, mirror onChange calls back up. */
  value: string
  /** Fired on every document edit with the new string. */
  onChange: (next: string) => void
  /** Called with the target title when the user clicks an Obsidian-style
   *  `[[Wikilink]]`. Implementers typically open the note or create it
   *  if it doesn't exist yet. */
  onWikilinkClick?: (target: string) => void
  /** Called with the tag text (no `#` prefix) when the user clicks an
   *  inline `#tag` span. Typically filters the sidebar to notes tagged
   *  with that value. */
  onTagClick?: (tag: string) => void
  /** Called with the URL when the user clicks a plain markdown link
   *  (`[label](url)`) or autolink (`<https://…>`). Implementers
   *  typically open the URL in the OS browser. Modifier-clicks are
   *  ignored so the user can still place the caret inside link text. */
  onLinkClick?: (url: string) => void
  /** Absolute path to the enclosing vault folder, used to resolve
   *  relative image paths. null/undefined disables local image rendering
   *  — HTTP(S) images still work. */
  vaultPath?: string | null
  /** Placeholder text shown when the document is empty. */
  placeholder?: string
  /** Extra class names applied to the wrapper div, not the editor itself. */
  className?: string
}

/**
 * CodeMirror 6 editor with Obsidian-style Live Preview rendering. The
 * component is "controlled" in the React sense: the parent holds the
 * markdown source string, and the editor only updates it via onChange.
 *
 * The CM6 view is created once on mount. When the parent rewrites `value`
 * (e.g. the user switches notes), we detect the divergence and dispatch a
 * full-doc replace into the existing view instead of recreating it, so
 * the undo history + view state stay intact across navigations.
 */
export function MarkdownEditor({
  value,
  onChange,
  onWikilinkClick,
  onTagClick,
  onLinkClick,
  vaultPath,
  placeholder,
  className,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Hold the latest onChange in a ref so we don't need to recreate the
  // CodeMirror view every time the parent re-renders with a new handler.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onWikilinkRef = useRef(onWikilinkClick)
  onWikilinkRef.current = onWikilinkClick
  const onTagRef = useRef(onTagClick)
  onTagRef.current = onTagClick
  const onLinkRef = useRef(onLinkClick)
  onLinkRef.current = onLinkClick

  // Reconfigure target for vault path — swapping the folder mid-session
  // (via the Settings dialog) should re-resolve image paths without
  // needing to unmount + remount the editor.
  const vaultPathCompartment = useRef(new Compartment())

  useEffect(() => {
    if (!host.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({
          base: markdownLanguage,
          // Lazy-load the language module when the user types a fenced
          // code block with a known lang tag (```ts, ```python, …).
          codeLanguages,
          // Registers `[[Wikilink]]` as a first-class inline syntax node
          // named "Wikilink" with two "WikilinkMark" delimiters, so the
          // live-preview plugin can decorate it like any other construct.
          extensions: [wikilinkParser],
        }),
        livePreviewPlugin,
        vaultPathCompartment.current.of(vaultPathFacet.of(vaultPath ?? null)),
        wikilinkClickExtension(() => onWikilinkRef.current),
        tagClickExtension(() => onTagRef.current),
        linkClickExtension(() => onLinkRef.current),
        EditorView.lineWrapping,
        highlightActiveLine(),
        inkwellTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: host.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync incoming `value` into the live CodeMirror state when they diverge.
  // Skip if the values are already equal to avoid echo loops on every
  // keystroke (onChange → setState → re-render → this effect).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  // Propagate vault path changes into the live Facet without recreating
  // the editor. Firing a reconfigure dispatch triggers the live-preview
  // plugin's update() which rebuilds decorations against the new path.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: vaultPathCompartment.current.reconfigure(
        vaultPathFacet.of(vaultPath ?? null),
      ),
    })
  }, [vaultPath])

  return (
    <div
      ref={host}
      className={className}
      data-placeholder={placeholder ?? ""}
    />
  )
}
