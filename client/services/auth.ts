/**
 * Auth service — login and registration. Every call routes through the
 * Storage abstraction so desktop (SQLite) and web (gateway) builds can share
 * the same public surface. Wire-format types still live here because the
 * login/register pages import them.
 */
import { getStorage } from "@/lib/storage"
import type { LoginRequest } from "../app/(public)/login/page"

/** Payload sent when creating a new user account. */
export interface RegisterRequest {
  name: string
  lastName: string
  username: string
  email: string
  password: string
}

/** Public profile fields the gateway returns for an authenticated user. */
export interface AuthUserResponse {
  id: string
  username: string
  usernameTag: string
  name: string
  lastName: string
  email: string
  role?: string
  createdAt: string
  updatedAt: string
}

/** Envelope returned by `/login` and `/register`. The JWT is delivered as an
 *  httpOnly cookie, so only the user profile is visible to JavaScript. When 2FA
 *  is enabled and a valid code wasn't supplied, `totpRequired` is true and
 *  `user` is absent (the client should prompt for the code and resubmit). */
export interface AuthResponse {
  user?: AuthUserResponse
  totpRequired?: boolean
}

export const loginUser = (credentials: LoginRequest): Promise<AuthResponse> =>
  getStorage().auth.login(credentials)

export const registerUser = (userData: RegisterRequest): Promise<AuthResponse> =>
  getStorage().auth.register(userData)

export type { Session, TwoFactorEnrollment } from "@/lib/storage"

/** List the authenticated user's active sessions (hosted only). */
export const listSessions = () => getStorage().auth.listSessions()

/** Revoke an active session by id (hosted only). */
export const revokeSession = (id: string) => getStorage().auth.revokeSession(id)

/** Begin 2FA enrolment — returns the secret/otpauth/QR to set up an app. */
export const enrollTwoFactor = () => getStorage().auth.enrollTwoFactor()

/** Verify a code and enable 2FA; resolves to one-time recovery codes. */
export const confirmTwoFactor = (code: string) => getStorage().auth.confirmTwoFactor(code)

/** Disable 2FA after verifying a current code. */
export const disableTwoFactor = (code: string) => getStorage().auth.disableTwoFactor(code)
