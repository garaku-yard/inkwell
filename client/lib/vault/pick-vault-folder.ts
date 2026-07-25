import { getStorage, type VaultFolderPreview } from "@/lib/storage"

/** How many of the found paths to name in the warning. Enough to recognise the
 *  folder by, short enough to read in a dialog. */
const SAMPLE_LIMIT = 3

/** The warning shown before adopting a folder that already has files in it.
 *  Exported for tests — the wording is the safeguard, so it's worth pinning. */
export function existingContentWarning(preview: VaultFolderPreview): string {
  const { fileCount, sample } = preview
  const shown = sample.slice(0, SAMPLE_LIMIT)
  const rest = fileCount - shown.length
  const lines = shown.map((p) => `  • ${p}`).join("\n")
  const more = rest > 0 ? `\n  …and ${rest} more` : ""
  const noun = fileCount === 1 ? "file" : "files"

  return (
    `This folder already contains ${fileCount} ${noun}:\n\n${lines}${more}\n\n` +
    `Choosing it makes it the vault folder, so these become part of the vault ` +
    `and are uploaded to the cloud — this is not a download into an empty folder.\n\n` +
    `Pick an empty folder instead if you didn't mean to upload them.`
  )
}

/** Shown when the folder can't be read, so we genuinely don't know what's in
 *  it. Confirming blind is the user's call, but it must be a choice. */
const UNREADABLE_WARNING =
  "This folder's contents couldn't be read, so there's no way to tell what's " +
  "already in it.\n\nChoosing it makes it the vault folder: anything inside " +
  "becomes part of the vault and is uploaded to the cloud.\n\nContinue anyway?"

/**
 * Opens the native folder picker and returns the chosen path, or `null` when
 * the user backed out.
 *
 * The folder a user picks *becomes* the vault root — the sync engine treats
 * everything already inside it as vault content and pushes it up. "Choose a
 * folder" reads like a download destination, so that difference has to be
 * stated before it happens, not discovered afterwards: a real user picked their
 * Downloads folder and it began uploading it (Orbit #152).
 *
 * `willUpload` says whether contents would actually leave the machine — true
 * for a cloud pull (which enables sync), and for a local project only once sync
 * is on. When it's false, adopting a folder full of notes is the ordinary way
 * to open an existing vault, and warning would be noise.
 */
export async function pickVaultFolder(opts: {
  title: string
  willUpload: boolean
}): Promise<string | null> {
  const { open, confirm } = await import("@tauri-apps/plugin-dialog")

  const picked = await open({ directory: true, multiple: false, title: opts.title })
  if (typeof picked !== "string") return null // cancelled
  if (!opts.willUpload) return picked

  // Fail loud, not open: if the check itself breaks we still ask, because
  // silently proceeding is the exact behaviour this guard exists to remove.
  let preview: VaultFolderPreview | null = null
  try {
    preview = await getStorage().vault.inspectFolder(picked)
  } catch {
    preview = null
  }

  if (preview && preview.fileCount === 0) return picked

  const ok = await confirm(
    preview ? existingContentWarning(preview) : UNREADABLE_WARNING,
    {
      title: "This folder isn't empty",
      kind: "warning",
      okLabel: "Use it anyway",
      cancelLabel: "Cancel",
    },
  )
  return ok ? picked : null
}
