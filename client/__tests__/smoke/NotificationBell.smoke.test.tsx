import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { NotificationBell } from "@/components/notifications/NotificationBell"
import type { Capability, NotificationsStorage } from "@/lib/storage"

import { installFakeStorage } from "../helpers/fake-storage"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function notifStub(overrides: Partial<NotificationsStorage> = {}): NotificationsStorage {
  return {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    listNotifications: vi.fn(async () => ({ notifications: [], unreadCount: 0 })),
    markRead: vi.fn(async () => {}),
    markAllRead: vi.fn(async () => {}),
    unreadCount: vi.fn(async () => 0),
    ...overrides,
  } as NotificationsStorage
}

describe("NotificationBell — smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders nothing when the build lacks the notifications capability", () => {
    installFakeStorage({
      capabilities: new Set<Capability>(["ai.byo"]),
      notifications: notifStub(),
    })
    render(<NotificationBell />)
    expect(screen.queryByLabelText(/Notifications/i)).not.toBeInTheDocument()
  })

  it("shows the unread badge from unreadCount when supported", async () => {
    installFakeStorage({
      capabilities: new Set<Capability>(["notifications"]),
      notifications: notifStub({ unreadCount: vi.fn(async () => 3) }),
    })
    render(<NotificationBell />)
    expect(screen.getByLabelText(/Notifications/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument())
    expect(screen.getByLabelText(/3 unread/i)).toBeInTheDocument()
  })
})
