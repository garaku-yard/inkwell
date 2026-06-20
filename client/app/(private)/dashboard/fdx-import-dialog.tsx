"use client"

/**
 * Confirmation + progress dialog for `.fdx` imports. Two entry points
 * land here: the file-association handler (Inkwell launched with a
 * `.fdx` path) and the dashboard's Import button (manual file picker).
 * Either way the dialog shows what will be imported, runs the parse +
 * persist sequence on confirm, and navigates to the new project's
 * editor on success.
 */

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, FileText, Loader2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/AuthContext"
import { importFdxAsProject } from "@/lib/import/import-fdx"
import { parseFdx, type ParsedFdx } from "@/lib/import/screenplay-fdx"

interface FdxImportDialogProps {
  /** Absolute path to the `.fdx` file on disk. The dialog reads the
   *  bytes itself via the Tauri fs plugin so the parent doesn't need
   *  to know about platform-specific I/O. Null means "closed". */
  filePath: string | null
  /** Called when the user dismisses without importing. */
  onCancel: () => void
}

/** Filename portion of an absolute path without extension, used for
 *  the dialog title row. Falls back to the full path on platforms
 *  with unfamiliar separators. */
function filenameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  const base = slash >= 0 ? path.slice(slash + 1) : path
  return base.replace(/\.fdx$/i, "")
}

export function FdxImportDialog({ filePath, onCancel }: FdxImportDialogProps) {
  const router = useRouter()
  const { user } = useAuth()
  const userId = user?.id

  const [parsed, setParsed] = useState<ParsedFdx | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Read + parse as soon as the path arrives so the user sees a
  // "X scenes, Y elements" preview before deciding to import.
  useEffect(() => {
    if (!filePath) {
      setParsed(null)
      setError(null)
      setIsImporting(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { readTextFile } = await import("@tauri-apps/plugin-fs")
        // The .fdx lives outside any vault (it's whatever file the user
        // opened); grant read on its folder before the app ships with no
        // broad static fs scope.
        const { allowFsDir } = await import("@/lib/tauri-scope")
        const fdxDir = filePath.slice(0, Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")))
        if (fdxDir) await allowFsDir(fdxDir, false)
        const xml = await readTextFile(filePath)
        const out = parseFdx(xml)
        if (!cancelled) {
          setParsed(out)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not read FDX file.")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filePath])

  const elementCount = useMemo(
    () => parsed?.scenes.reduce((acc, s) => acc + s.elements.length, 0) ?? 0,
    [parsed],
  )

  const handleImport = async () => {
    if (!parsed || !userId) return
    setIsImporting(true)
    setError(null)
    try {
      const project = await importFdxAsProject(parsed, userId)
      router.push(`/projects/${project.id}/editor`)
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import screenplay.")
      setIsImporting(false)
    }
  }

  const open = filePath !== null
  const fallbackTitle = filePath ? filenameOf(filePath) : ""

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isImporting) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Import Final Draft script
          </DialogTitle>
          <DialogDescription>
            {parsed
              ? `Inkwell will create a new screenplay project titled "${parsed.title || fallbackTitle}".`
              : "Reading file…"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Couldn&apos;t import</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {parsed && !error && (
          <div className="rounded-md border p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Scenes</span><span className="font-medium">{parsed.scenes.length}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Elements</span><span className="font-medium">{elementCount}</span></div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!parsed || isImporting || !userId}>
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
