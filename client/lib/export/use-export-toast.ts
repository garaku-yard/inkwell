/**
 * Wraps an export call so the user gets a confirmation toast instead
 * of a silent browser download. Most exporters in lib/export/ trigger
 * a blob download via a hidden <a> click — there's no return value
 * and no throw — so we toast immediately after invoking the function.
 *
 * If the exporter does throw (rare; today only the EPUB builder can,
 * via JSON.stringify on a value with circular refs, which shouldn't
 * happen with our schema), we surface the error message in a
 * destructive toast so the writer doesn't think the export silently
 * succeeded.
 */

import { useCallback } from "react"

import { useToast } from "@/hooks/use-toast"

/** Suggested download filename for a project. Mirrors the slug rule
 *  used by every exporter in this folder so the toast description
 *  matches what actually lands on disk. */
function downloadFilename(projectTitle: string, extension: string): string {
  const slug = projectTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "export"
  return `${slug}.${extension}`
}

export interface RunExportOptions {
  /** File extension without the leading dot (`fdx`, `epub`, `cbz`). */
  extension: string
  /** Project title used to build the filename in the toast description. */
  projectTitle: string
  /** The actual export call. May be synchronous (blob download) or
   *  asynchronous (future Tauri "save as" flows). */
  run: () => void | Promise<void>
}

export function useExportToast() {
  const { toast } = useToast()

  return useCallback(
    async (opts: RunExportOptions) => {
      try {
        await opts.run()
        toast({
          title: "Exported",
          description: `Saved as ${downloadFilename(opts.projectTitle, opts.extension)}`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        toast({
          title: "Export failed",
          description: message,
          variant: "destructive",
        })
      }
    },
    [toast],
  )
}
