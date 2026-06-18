import type { NotificationPreferences, NotificationsStorage } from "@/lib/storage"

// ─── Notifications (desktop = on-device preferences) ─────────────────────────
//
// The desktop build has no delivery backend (no server, no email), so
// preferences are purely informational and live on-device in localStorage —
// the same key the settings section used before it moved behind Storage. This
// keeps the desktop experience identical and honest: the toggles persist, but
// nothing acts on them locally.

const STORAGE_KEY = "inkwell:notifications"

const DEFAULTS: NotificationPreferences = {
  emailComments: true,
  emailMentions: true,
  emailProjectUpdates: true,
  emailCollaboratorJoins: true,
  inAppNotifications: true,
  marketingEmails: false,
  productUpdates: true,
}

function read(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export const notifications: NotificationsStorage = {
  getPreferences: async () => read(),
  updatePreferences: async (prefs) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    }
    return prefs
  },
}
