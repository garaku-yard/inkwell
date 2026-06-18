import type { AuthResponse, RegisterRequest } from "@/services/auth"

// ─── Auth ─────────────────────────────────────────────────────────────────

/** Minimal shape of the current user returned by {@link AuthStorage.me}. */
export interface CurrentUser {
  id: string
  email: string
  username: string
  tag: string
  role: string
  name: string
  lastName: string
}

/** One active sign-in for the Security → Active Sessions UI. */
export interface Session {
  id: string
  /** Raw user-agent captured at login; the UI derives a friendly label. */
  deviceInfo: string
  ipAddress: string
  createdAt: string
  lastUsedAt: string
  expiresAt: string
  /** True for the session belonging to the requesting device. */
  isCurrent: boolean
}

export interface AuthStorage {
  /** Log in with email + password. Remote sets the httpOnly cookie; local
   *  returns a synthesised user from the on-disk profile. */
  login(credentials: { email: string; password: string }): Promise<AuthResponse>
  /** Create a new account. Remote sets the httpOnly cookie on success. */
  register(payload: RegisterRequest): Promise<AuthResponse>
  /** Clear the session (cookie remote-side; in-memory local-side). */
  logout(): Promise<void>
  /** Return the currently authenticated user, or null when signed out. */
  me(): Promise<CurrentUser | null>
  /** List the user's active sessions. Hosted only; local returns []. */
  listSessions(): Promise<Session[]>
  /** Revoke a session by id. Hosted only; local no-ops. */
  revokeSession(id: string): Promise<void>
}
