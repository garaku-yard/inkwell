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

/** A single entry in the in-app notification feed. */
export interface Notification {
  id: string
  /** Source domain event, e.g. "collaboration.added". */
  type: string
  title: string
  body: string
  /** Optional in-app navigation target, e.g. "/projects/<id>". */
  link?: string
  read: boolean
  /** RFC3339 timestamp. */
  createdAt: string
}

/** A page of the feed plus the total unread count (independent of paging). */
export interface NotificationFeed {
  notifications: Notification[]
  unreadCount: number
}

/**
 * NotificationsStorage manages a user's notification delivery preferences and
 * their in-app feed.
 *
 * The hosted build persists preferences server-side (so they sync across
 * devices and feed the delivery worker) and serves a real feed populated by the
 * notification worker. The desktop build keeps preferences on-device and has no
 * feed (no events), so its feed methods return empty/no-op. Both honour the
 * same shape.
 */
export interface NotificationsStorage {
  /** Returns the user's saved preferences, or the all-on defaults when none
   *  have been saved yet. */
  getPreferences(): Promise<NotificationPreferences>
  /** Persists the full preference set and returns the stored values. */
  updatePreferences(prefs: NotificationPreferences): Promise<NotificationPreferences>

  /** Returns a page of the in-app feed (newest first) plus the unread total. */
  listNotifications(opts?: { limit?: number; offset?: number }): Promise<NotificationFeed>
  /** Marks a single notification read. */
  markRead(id: string): Promise<void>
  /** Marks every unread notification read. */
  markAllRead(): Promise<void>
  /** Returns the unread count without fetching the feed. */
  unreadCount(): Promise<number>
}
