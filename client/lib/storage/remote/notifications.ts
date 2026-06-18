import { apiClient } from "@/lib/api"

import type {
  NotificationFeed,
  NotificationPreferences,
  NotificationsStorage,
} from "@/lib/storage"

// ─── Notifications ──────────────────────────────────────────────────────────

export const notifications: NotificationsStorage = {
  getPreferences: () =>
    apiClient<NotificationPreferences>("notifications/preferences", { method: "GET" }),
  updatePreferences: (prefs) =>
    apiClient<NotificationPreferences>("notifications/preferences", {
      method: "PUT",
      body: prefs,
    }),

  listNotifications: (opts) => {
    const params = new URLSearchParams()
    if (opts?.limit != null) params.set("limit", String(opts.limit))
    if (opts?.offset != null) params.set("offset", String(opts.offset))
    const qs = params.toString()
    return apiClient<NotificationFeed>(`notifications${qs ? `?${qs}` : ""}`, { method: "GET" })
  },
  markRead: async (id) => {
    await apiClient<void>(`notifications/${id}/read`, { method: "POST" })
  },
  markAllRead: async () => {
    await apiClient<void>("notifications/read-all", { method: "POST" })
  },
  unreadCount: async () => {
    const res = await apiClient<{ count: number }>("notifications/unread-count", { method: "GET" })
    return res.count
  },
}
