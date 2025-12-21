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
  Accessibility, 
  Info 
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { SettingsSection } from "@/app/(private)/settings/page"

interface SettingsSidebarProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

const sections = [
  { id: "account" as const, label: "Account", icon: User },
  { id: "security" as const, label: "Security", icon: Shield },
  { id: "privacy" as const, label: "Privacy", icon: Eye },
  { id: "appearance" as const, label: "Appearance", icon: Palette },
  { id: "notifications" as const, label: "Notifications", icon: Bell },
  { id: "data" as const, label: "Data & Account Control", icon: Database },
  { id: "billing" as const, label: "Billing", icon: CreditCard },
  { id: "collaboration" as const, label: "Collaboration", icon: Users },
  { id: "integrations" as const, label: "Integrations", icon: Plug },
  { id: "accessibility" as const, label: "Accessibility", icon: Accessibility },
  { id: "about" as const, label: "About & Legal", icon: Info },
]

export function SettingsSidebar({ activeSection, onSectionChange }: SettingsSidebarProps) {
  return (
    <nav className="w-full lg:w-64 flex-shrink-0">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-2">
        <div className="space-y-1">
          {sections.map((section) => {
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
