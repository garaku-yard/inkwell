import { EditorView } from "@codemirror/view"

/**
 * CodeMirror theme that slots into Inkwell's CSS variable system. Colours
 * come from the design tokens declared in `globals.css`, so light/dark
 * mode follows the rest of the app without any JS-side branching.
 */
export const inkwellTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--foreground)",
      backgroundColor: "transparent",
      // Vault font is per-editor user-configurable. The wrapper in
      // VaultEditor sets `--inkwell-vault-font` inline; the fallback
      // chain catches the case where ThemeContext isn't mounted yet.
      fontFamily: "var(--inkwell-vault-font, var(--font-sans))",
      fontSize: "15px",
      lineHeight: "1.7",
    },
    ".cm-content": {
      padding: "2.5rem 3rem 6rem",
      caretColor: "var(--primary)",
      // 42rem ≈ 672px keeps line length around 65-70ch at 15px font
      // size, which lands inside the long-form-reading sweet spot
      // (BRANDBOOK pins prose at 680px). Was 48rem ≈ 768px which
      // ran past the 75ch comfort ceiling.
      maxWidth: "42rem",
      margin: "0 auto",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-line": {
      padding: "0",
    },
    ".cm-gutters": { display: "none" },

    // Rendered markdown styling. Classes are emitted by the live-preview
    // plugin — see `./live-preview.ts`.
    ".cm-md-bold": { fontWeight: "700" },
    ".cm-md-italic": { fontStyle: "italic" },
    ".cm-md-strike": { textDecoration: "line-through", color: "var(--muted-foreground)" },
    ".cm-md-code": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.9em",
      padding: "1px 5px",
      borderRadius: "4px",
      backgroundColor: "var(--muted)",
    },
    ".cm-md-link": {
      // Uses the dedicated --link token (teal) rather than --primary so
      // links stay distinct from body text in dark mode, where --primary
      // collapses to near-white. Underline reinforces the affordance for
      // colour-blind readers.
      color: "var(--link)",
      textDecoration: "underline",
      textUnderlineOffset: "3px",
    },

    ".cm-md-h1": {
      fontSize: "1.9em",
      fontWeight: "700",
      lineHeight: "1.2",
      paddingTop: "0.3em",
      paddingBottom: "0.1em",
      letterSpacing: "-0.01em",
    },
    ".cm-md-h2": {
      fontSize: "1.55em",
      fontWeight: "700",
      lineHeight: "1.25",
      paddingTop: "0.2em",
      paddingBottom: "0.1em",
    },
    ".cm-md-h3": {
      fontSize: "1.3em",
      fontWeight: "600",
      lineHeight: "1.3",
      paddingTop: "0.2em",
    },
    ".cm-md-h4": { fontSize: "1.15em", fontWeight: "600" },
    ".cm-md-h5": { fontSize: "1.05em", fontWeight: "600" },
    ".cm-md-h6": { fontSize: "1em", fontWeight: "600", color: "var(--muted-foreground)" },

    ".cm-md-blockquote": {
      paddingLeft: "1em",
      borderLeft: "3px solid var(--border)",
      color: "var(--muted-foreground)",
      fontStyle: "italic",
    },

    ".cm-md-hr": {
      display: "block",
      margin: "1em 0",
    },
    ".cm-md-hr hr": {
      border: "none",
      borderTop: "1px solid var(--border)",
      margin: "0",
    },

    // Unordered list bullet glyph, rendered by BulletWidget.
    ".cm-md-bullet": {
      display: "inline-block",
      color: "var(--muted-foreground)",
      fontWeight: "700",
      lineHeight: "1",
      transform: "translateY(-1px)",
    },

    // Wikilinks use a slightly different tint from regular links so users
    // can tell internal references apart from external URLs at a glance.
    ".cm-md-wikilink": {
      color: "var(--primary)",
      backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)",
      padding: "1px 4px",
      borderRadius: "3px",
      textDecoration: "none",
      cursor: "pointer",
    },
    ".cm-md-wikilink:hover": {
      backgroundColor: "color-mix(in srgb, var(--primary) 16%, transparent)",
    },

    // Inline tag — pill-shaped, muted tint, click-to-filter cursor. We
    // borrow the muted-foreground palette so it reads quieter than
    // wikilinks (which are primary-coloured and more action-weighty).
    ".cm-md-tag": {
      color: "var(--muted-foreground)",
      backgroundColor:
        "color-mix(in srgb, var(--muted-foreground) 12%, transparent)",
      padding: "1px 6px",
      borderRadius: "999px",
      fontSize: "0.88em",
      cursor: "pointer",
    },
    ".cm-md-tag:hover": {
      color: "var(--foreground)",
      backgroundColor:
        "color-mix(in srgb, var(--muted-foreground) 22%, transparent)",
    },

    // Task list checkboxes
    ".cm-md-task-checkbox": {
      appearance: "none",
      width: "15px",
      height: "15px",
      margin: "0 6px 0 0",
      verticalAlign: "middle",
      border: "1.5px solid var(--border)",
      borderRadius: "3px",
      cursor: "pointer",
      backgroundColor: "var(--background)",
      transition: "background-color 120ms, border-color 120ms",
    },
    ".cm-md-task-checkbox:hover": {
      borderColor: "var(--primary)",
    },
    // Checked state — light mode: white tick on dark-green --primary.
    // The dark-mode override lives in globals.css because CM6 theme
    // scoping mangles ancestor-class selectors like `.dark`.
    ".cm-md-task-checkbox:checked": {
      backgroundColor: "var(--primary)",
      borderColor: "var(--primary)",
      backgroundImage:
        "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundSize: "10px 10px",
    },
    ".cm-md-task-done .cm-line": {
      color: "var(--muted-foreground)",
    },
    ".cm-md-task-done": {
      textDecoration: "line-through",
      textDecorationColor: "color-mix(in srgb, var(--muted-foreground) 60%, transparent)",
    },

    // Inline images
    ".cm-md-image": {
      display: "inline-block",
      maxWidth: "100%",
    },
    ".cm-md-image img": {
      display: "block",
      maxWidth: "100%",
      maxHeight: "480px",
      borderRadius: "6px",
      border: "1px solid var(--border)",
      margin: "0.5em 0",
    },

    // Tables
    ".cm-md-table": {
      margin: "1em 0",
      overflowX: "auto",
    },
    ".cm-md-table table": {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "0.95em",
    },
    ".cm-md-table th, .cm-md-table td": {
      border: "1px solid var(--border)",
      padding: "6px 10px",
      textAlign: "left",
    },
    ".cm-md-table th": {
      backgroundColor: "var(--muted)",
      fontWeight: "600",
    },
    ".cm-md-table tbody tr:nth-child(even)": {
      backgroundColor: "color-mix(in srgb, var(--muted) 40%, transparent)",
    },

    // Fenced code blocks — highlighted by @codemirror/lang-markdown +
    // @codemirror/language-data; we just paint a quiet background plate.
    ".cm-line:has(.tok-comment), .cm-line:has(.tok-keyword), .cm-line:has(.tok-string)":
      {
        // No-op; language-specific highlight classes get default tags.
      },
    ".cm-md-code-block": {
      backgroundColor: "var(--muted)",
      fontFamily: "var(--font-mono)",
    },
  },
  { dark: false },
)
