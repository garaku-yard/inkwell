/**
 * Shared visual helpers for rendering presence — a stable per-user colour and
 * display initials — so the header avatar bar and the in-editor "who's editing
 * this" highlights agree on how a given person looks.
 */

/** A stable hue (0–359) derived from a user id, so a person's colour is the
 *  same everywhere it appears. */
export function hueFor(userId: string): number {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

/** Up-to-two-letter initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
