/**
 * Pure helper for rewriting `[[Title]]` references when a note is
 * renamed. Lives outside the storage layer so tests can hit it without
 * stubbing the filesystem; `local.ts` imports `rewriteWikilinks` and
 * applies it to each markdown file it sweeps.
 *
 * Matches the four wikilink shapes Obsidian users actually write:
 *   - `[[Old]]`
 *   - `[[Old|Alias]]`
 *   - `[[Old#Heading]]`
 *   - `[[Old#Heading|Alias]]`
 *
 * The heading anchor and alias (with their delimiters) are preserved
 * verbatim; only the title segment changes. Case-insensitive match
 * because Obsidian treats wikilinks as case-insensitive when resolving
 * targets — the replacement uses the new title's casing so the file
 * settles on a canonical form on the next edit.
 */

const REGEX_META = /[.*+?^${}()|[\]\\]/g

/** Builds the title-rewrite regex for an old → new rename. Exposed
 *  separately so tests can probe match/no-match behaviour without
 *  running the full rewrite. */
export function buildSweepRegex(oldTitle: string): RegExp {
  const escaped = oldTitle.replace(REGEX_META, "\\$&")
  return new RegExp(
    `(\\[\\[\\s*)${escaped}(\\s*(?:#[^|\\]]*)?(?:\\|[^\\]]*)?\\s*\\]\\])`,
    "gi",
  )
}

/** Returns the body with every `[[oldTitle …]]` shape rewritten to
 *  carry `newTitle` instead. Returns the original string when no
 *  matches were found, so callers can short-circuit a write. */
export function rewriteWikilinks(
  body: string,
  oldTitle: string,
  newTitle: string,
): string {
  if (!oldTitle || oldTitle === newTitle) return body
  const regex = buildSweepRegex(oldTitle)
  if (!regex.test(body)) return body
  regex.lastIndex = 0
  return body.replace(
    regex,
    (_match, open: string, close: string) => `${open}${newTitle}${close}`,
  )
}
