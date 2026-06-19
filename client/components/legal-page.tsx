import Link from "next/link"

import { BrandLogo } from "@/components/brand-logo"

/**
 * Shared chrome for the public legal pages (/terms, /privacy, /licenses):
 * a brand header that links home, a centered reading column, and a title +
 * "last updated" line. Pages pass their body as children. Server component —
 * no client hooks, so it static-exports cleanly under the Tauri build too.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  /** ISO date the copy was last revised, shown under the title. */
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center px-6 py-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Inkwell home">
            <BrandLogo show="mark" className="h-7 w-auto" />
            <BrandLogo show="wordmark" className="h-4 w-auto" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-1 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-[var(--link)] [&_a]:underline [&_strong]:text-foreground">
          {children}
        </div>
        <nav className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-sm text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-foreground">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund">Refund Policy</Link>
          <Link href="/licenses">Licenses</Link>
        </nav>
      </main>
    </div>
  )
}
