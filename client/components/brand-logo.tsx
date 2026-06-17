import { cn } from "@/lib/utils"

/**
 * Theme-aware Inkwell brand assets. Each logical image ships as a charcoal
 * variant (for light themes) and a cream variant (for dark themes); the right
 * one is shown via the `.dark` class so the mark always sits on the correct
 * contrast. Assets live in `public/brand/` (trimmed PNGs exported from the
 * brand source).
 */

/** Renders the dark + cream variants of one asset, toggling on `.dark`. The
 *  hidden variant is `display:none`, so screen readers only read the visible
 *  one — pass the accessible name once via `alt`, "" to mark it decorative. */
function ThemedAsset({
  base,
  alt,
  className,
}: {
  base: string
  alt: string
  className?: string
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/${base}-dark.png`} alt={alt} className={cn("dark:hidden", className)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/${base}-light.png`}
        alt={alt}
        className={cn("hidden dark:block", className)}
      />
    </>
  )
}

interface BrandLogoProps {
  /** `mark` = nib monogram only · `wordmark` = INKWELL only · `lockup` =
   *  monogram stacked above the wordmark (default). */
  show?: "mark" | "wordmark" | "lockup"
  className?: string
}

/** The Inkwell logo. Defaults to the vertical lockup used on the auth screens;
 *  pass `show="mark"` / `show="wordmark"` for tighter spots like the titlebar. */
export function BrandLogo({ show = "lockup", className }: BrandLogoProps) {
  if (show === "mark") {
    return <ThemedAsset base="inkwell-mark" alt="Inkwell" className={className} />
  }
  if (show === "wordmark") {
    return <ThemedAsset base="inkwell-wordmark" alt="Inkwell" className={className} />
  }
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <ThemedAsset base="inkwell-mark" alt="Inkwell" className="h-14 w-auto" />
      <ThemedAsset base="inkwell-wordmark" alt="" className="h-5 w-auto" />
    </div>
  )
}
