import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest"

import { NotificationsSection } from "@/components/settings/sections/notifications-section"
import type { Capability, NotificationPreferences } from "@/lib/storage"

import { installFakeStorage } from "../helpers/fake-storage"

const STORED: NotificationPreferences = {
  emailComments: true,
  emailMentions: false,
  emailProjectUpdates: true,
  emailCollaboratorJoins: true,
  inAppNotifications: true,
  marketingEmails: false,
  productUpdates: true,
}

describe("NotificationsSection — smoke", () => {
  let getPreferences: Mock<() => Promise<NotificationPreferences>>
  let updatePreferences: Mock<(prefs: NotificationPreferences) => Promise<NotificationPreferences>>

  beforeEach(() => {
    getPreferences = vi.fn(async () => STORED)
    updatePreferences = vi.fn(async (p: NotificationPreferences) => p)
    installFakeStorage({
      capabilities: new Set<Capability>(["notifications"]),
      notifications: {
        getPreferences,
        updatePreferences,
        listNotifications: vi.fn(async () => ({ notifications: [], unreadCount: 0 })),
        markRead: vi.fn(async () => {}),
        markAllRead: vi.fn(async () => {}),
        unreadCount: vi.fn(async () => 0),
      },
    })
  })

  it("loads preferences from storage and renders all seven toggles", async () => {
    render(<NotificationsSection />)
    await waitFor(() => expect(getPreferences).toHaveBeenCalledTimes(1))
    expect(screen.getAllByRole("switch")).toHaveLength(7)
  })

  it("persists a toggle through storage.updatePreferences", async () => {
    render(<NotificationsSection />)
    await waitFor(() => expect(getPreferences).toHaveBeenCalled())

    // First switch is "Comments" (emailComments), stored as true → toggles off.
    const switches = screen.getAllByRole("switch")
    fireEvent.click(switches[0])

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledTimes(1))
    const sent = updatePreferences.mock.calls[0][0] as NotificationPreferences
    expect(sent.emailComments).toBe(false)
    // Untouched toggles are sent through unchanged (full-object save).
    expect(sent.emailCollaboratorJoins).toBe(true)
  })
})
