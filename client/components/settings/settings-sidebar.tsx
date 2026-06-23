"use client"

import {
  User,
  Shield,
  Eye,
  Palette,
  Bell,
  Database,
  CreditCard,
  Users,
  Plug,
  Sparkles,
  Accessibility,
  Info,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getStorage } from "@/lib/storage"
import type { Capability } from "@/lib/storage"
import { getAuthToken } from "@/lib/api"
import type { SettingsSection } from "@/app/(private)/settings/page"

interface SettingsSidebarProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

/** A settings section, with how it's gated. `cap` → only shown on builds with
 *  that capability (e.g. collaboration/notifications are web-only; sync is
 *  desktop). `needsAccount` → only shown when there's a cloud account in play
 *  (web has `auth`; desktop only once signed in), since these are account/server
 *  features that no-op or error otherwise. No gate → always shown. */
interface SectionDef {
  id: SettingsSection
  label: string
  icon: typeof User
  cap?: Capability
  needsAccount?: boolean
}

const sections: SectionDef[] = [
  { id: "account", label: "Account", icon: User },
  { id: "security", label: "Security", icon: Shield, needsAccount: true },
  { id: "privacy", label: "Privacy", icon: Eye, needsAccount: true },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell, cap: "notifications" },
  { id: "data", label: "Data & Account Control", icon: Database },
  { id: "billing", label: "Billing", icon: CreditCard, needsAccount: true },
  { id: "collaboration", label: "Collaboration", icon: Users, cap: "collaboration" },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "ai", label: "AI Providers", icon: Sparkles },
  { id: "sync", label: "Sync", icon: RefreshCw, cap: "sync" },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
  { id: "about", label: "About & Legal", icon: Info },
]

export function SettingsSidebar({ activeSection, onSectionChange }: SettingsSidebarProps) {
  // capabilities is a stable Set bound at boot; getAuthToken() reflects a linked
  // cloud account (desktop) — both safe to read at render. The page re-renders
  // on auth change, so a fresh sign-in reveals the account sections.
  const caps = getStorage().capabilities
  const hasAccount = caps.has("auth") || getAuthToken() !== null
  const visibleSections = sections.filter((s) => {
    if (s.cap) return caps.has(s.cap)
    if (s.needsAccount) return hasAccount
    return true
  })

  return (
    <nav className="w-full lg:w-64 flex-shrink-0">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-2">
        <div className="space-y-1">
          {visibleSections.map((section) => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{section.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
