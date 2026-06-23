"use client"

import { BrandLogo } from "@/components/brand-logo"

import { AppHeaderActions } from "./AppHeaderActions"

interface AppHeaderProps {
  inviteCount?: number
}

/** Top-of-page banner used by Dashboard / Shared / Analytics. The
 *  editor surfaces don't render this — they mount AppHeaderActions
 *  directly inside their own toolbars instead, so user menu /
 *  invites / theme toggle / log out stay reachable while writing. */
export function AppHeader({ inviteCount = 0 }: AppHeaderProps) {
  return (
    <header className="border-b bg-background shrink-0">
      <div className="container mx-auto flex items-center justify-between py-3 px-4 sm:px-6 lg:px-8">
        {/* Left — logo + nav */}
        <div className="flex items-center gap-6">
          {/* Lockup: the nib was towering over the wordmark (h-7 vs h-4) and
              sitting tight — scaled the mark closer to the wordmark and opened
              the gap so it reads as one balanced lockup with breathing room. */}
          <div className="flex items-center gap-2.5 select-none">
            <BrandLogo show="mark" className="h-6 w-auto" />
            <BrandLogo show="wordmark" className="h-4 w-auto" />
          </div>
        </div>

        {/* Right — actions + user */}
        <AppHeaderActions inviteCount={inviteCount} />
      </div>
    </header>
  )
}
