// ─── Notifications ──────────────────────────────────────────────────────────

/**
 * NotificationPreferences mirrors the seven toggles in the settings UI. Field
 * names match the server's JSON contract one-to-one so the section maps
 * directly onto storage without translation.
 */
export interface NotificationPreferences {
  /** Email me when someone comments on my project. */
  emailComments: boolean
  /** Email me when someone mentions me. */
  emailMentions: boolean
  /** Email me about changes to projects I collaborate on. */
  emailProjectUpdates: boolean
  /** Email me when someone joins my project. */
  emailCollaboratorJoins: boolean
  /** Master switch for the in-app notification feed. */
  inAppNotifications: boolean
  /** Receive promotional / marketing email. */
  marketingEmails: boolean
  /** Receive product / feature announcement email. */
  productUpdates: boolean
}

/**
 * NotificationsStorage manages a user's notification delivery preferences.
 *
 * The hosted build persists these server-side (so they sync across devices and
 * feed the delivery worker); the desktop build keeps them on-device, since it
 * has no delivery backend. Both honour the same shape.
 */
export interface NotificationsStorage {
  /** Returns the user's saved preferences, or the all-on defaults when none
   *  have been saved yet. */
  getPreferences(): Promise<NotificationPreferences>
  /** Persists the full preference set and returns the stored values. */
  updatePreferences(prefs: NotificationPreferences): Promise<NotificationPreferences>
}
