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
  /** Relative URL of the user's avatar (e.g. /uploads/avatars/…), if set. */
  avatarUrl?: string
  /** Whether two-factor auth is enabled on the account. */
  twoFactorEnabled?: boolean
}

/** Data shown during 2FA enrolment so the user can add Inkwell to an
 *  authenticator app. */
export interface TwoFactorEnrollment {
  /** Base32 secret, for manual entry. */
  secret: string
  /** otpauth:// URI. */
  otpauthUri: string
  /** A `data:image/png;base64,…` QR code (may be empty). */
  qrDataUri: string
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
  /** Log in with email + password (+ a 2FA code on the second step). Remote
   *  sets the httpOnly cookie; local returns a synthesised user. When 2FA is on
   *  and no/invalid code is supplied, the response has `totpRequired: true`. */
  login(credentials: { email: string; password: string; totpCode?: string }): Promise<AuthResponse>
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
  /** Begin 2FA enrolment (generate a pending secret). Hosted only. */
  enrollTwoFactor(): Promise<TwoFactorEnrollment>
  /** Verify a code and enable 2FA; resolves to one-time recovery codes. */
  confirmTwoFactor(code: string): Promise<string[]>
  /** Disable 2FA after verifying a current code. */
  disableTwoFactor(code: string): Promise<void>
}
