import { apiClient } from "@/lib/api"

import type { NotificationPreferences, NotificationsStorage } from "@/lib/storage"

// ─── Notifications ──────────────────────────────────────────────────────────

export const notifications: NotificationsStorage = {
  getPreferences: () =>
    apiClient<NotificationPreferences>("notifications/preferences", { method: "GET" }),
  updatePreferences: (prefs) =>
    apiClient<NotificationPreferences>("notifications/preferences", {
      method: "PUT",
      body: prefs,
    }),
}
