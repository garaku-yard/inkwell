"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/AuthContext"
import { SettingsSidebar } from "@/components/settings/settings-sidebar"
import { AccountSection } from "@/components/settings/sections/account-section"
import { SecuritySection } from "@/components/settings/sections/security-section"
import { PrivacySection } from "@/components/settings/sections/privacy-section"
import { NotificationsSection } from "@/components/settings/sections/notifications-section"
import { DataControlSection } from "@/components/settings/sections/data-control-section"
import { BillingSection } from "@/components/settings/sections/billing-section"
import { CollaborationSection } from "@/components/settings/sections/collaboration-section"
import { IntegrationsSection } from "@/components/settings/sections/integrations-section"
import { AccessibilitySection } from "@/components/settings/sections/accessibility-section"
import { AboutSection } from "@/components/settings/sections/about-section"

export type SettingsSection = 
  | "account"
  | "security"
  | "privacy"
  | "notifications"
  | "data"
  | "billing"
  | "collaboration"
  | "integrations"
  | "accessibility"
  | "about"

export default function SettingsPage() {
  const { user } = useAuth()
  const [activeSection, setActiveSection] = useState<SettingsSection>("account")

  const renderSection = () => {
    switch (activeSection) {
      case "account":
        return <AccountSection user={user} />
      case "security":
        return <SecuritySection />
      case "privacy":
        return <PrivacySection />
      case "notifications":
        return <NotificationsSection />
      case "data":
        return <DataControlSection userEmail={user?.email || ""} />
      case "billing":
        return <BillingSection />
      case "collaboration":
        return <CollaborationSection />
      case "integrations":
        return <IntegrationsSection />
      case "accessibility":
        return <AccessibilitySection />
      case "about":
        return <AboutSection />
      default:
        return <AccountSection user={user} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <SettingsSidebar 
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  )
}
