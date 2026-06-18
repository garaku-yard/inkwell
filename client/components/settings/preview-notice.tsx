import { Info } from "lucide-react"

/**
 * Honest inline banner for settings whose controls are saved as local
 * preferences but are not yet acted on server-side (no enforcement/delivery
 * backend exists yet). Keeps the UI truthful instead of toasting "saved" as
 * if the setting took effect. Pass the section-specific explanation as
 * children.
 */
export function PreviewNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/10 dark:text-amber-200">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{children}</span>
    </div>
  )
}
