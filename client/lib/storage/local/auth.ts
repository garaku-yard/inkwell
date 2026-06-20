import { apiClient, ApiError, getAuthToken } from "@/lib/api"
import { persistAuthToken } from "@/lib/desktop-auth"

import type { AuthResponse, AuthStorage, CurrentUser, Session, TwoFactorEnrollment } from "@/lib/storage"
import { ensureUserProfile } from "./shared"

// ─── Auth (desktop) ─────────────────────────────────────────────────────────
//
// Desktop auth is an *optional account link* over a local-first app. The OS
// keychain holds a bearer token (managed by the api/desktop-auth transport);
// signing in stores one, signing out clears it. The crucial local-first
// property lives in `me()`: when no valid token is present it returns the
// always-available local profile, so the app is never forced to a login gate
// and works fully offline. Data stays in local SQLite regardless — linking an
// account only changes the identity, in preparation for the sync engine.

/** Shape of the user payload the gateway returns from login/register/me. It is
 *  a structural superset of AuthUserResponse so login/register can return it
 *  directly. */
interface GatewayUser {
  id: string
  email: string
  username: string
  usernameTag: string
  name: string
  lastName: string
  role?: string
  avatarUrl?: string
  twoFactorEnabled?: boolean
  createdAt: string
  updatedAt: string
}

/** Maps a gateway user payload to the storage-layer CurrentUser shape. */
function toCurrentUser(u: GatewayUser): CurrentUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    tag: u.usernameTag,
    role: u.role ?? "user",
    name: u.name,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    twoFactorEnabled: u.twoFactorEnabled ?? false,
  }
}

export const auth: AuthStorage = {
  login: async (credentials): Promise<AuthResponse> => {
    const res = await apiClient<{ user?: GatewayUser; totpRequired?: boolean; accessToken?: string }>(
      "login",
      { method: "POST", body: credentials },
    )
    // 2FA second step — no token yet; the caller prompts for the code.
    if (res.totpRequired) return { totpRequired: true }
    if (res.accessToken) await persistAuthToken(res.accessToken)
    return { user: res.user }
  },

  register: async (payload): Promise<AuthResponse> => {
    const res = await apiClient<{ user?: GatewayUser; accessToken?: string }>("register", {
      method: "POST",
      body: payload,
    })
    if (res.accessToken) await persistAuthToken(res.accessToken)
    return { user: res.user }
  },

  logout: async () => {
    // Best-effort server revoke, then drop the token so we revert to the local
    // profile. A failed revoke is harmless — the token is cleared regardless.
    try {
      await apiClient<void>("logout", { method: "POST" })
    } catch {
      // offline / already-expired — clearing the token below is what matters.
    }
    await persistAuthToken(null)
  },

  me: async (): Promise<CurrentUser | null> => {
    if (getAuthToken()) {
      try {
        const data = await apiClient<{ user: GatewayUser }>("users/me", { method: "GET" })
        return toCurrentUser(data.user)
      } catch (err) {
        // 401 means the token is definitively invalid — unlink it. Any other
        // error (offline, 5xx) is transient: keep the token so we re-link when
        // connectivity returns, and fall back to the local profile for now.
        if (err instanceof ApiError && err.status === 401) {
          await persistAuthToken(null)
        }
      }
    }
    // Local-first: the working identity when not linked (or offline).
    return ensureUserProfile()
  },

  // Session inventory + 2FA operate on the linked remote account; they require
  // a token and otherwise return empty / no-op so the UI degrades gracefully.
  listSessions: async (): Promise<Session[]> => {
    if (!getAuthToken()) return []
    return apiClient<Session[]>("users/me/sessions", { method: "GET" })
  },

  revokeSession: async (id: string): Promise<void> => {
    if (!getAuthToken()) return
    await apiClient<void>(`users/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })
  },

  enrollTwoFactor: async (): Promise<TwoFactorEnrollment> =>
    apiClient<TwoFactorEnrollment>("users/me/2fa/enroll", { method: "POST" }),

  confirmTwoFactor: async (code: string): Promise<string[]> => {
    const res = await apiClient<{ recoveryCodes: string[] }>("users/me/2fa/verify", {
      method: "POST",
      body: { code },
    })
    return res.recoveryCodes ?? []
  },

  disableTwoFactor: async (code: string): Promise<void> => {
    await apiClient<void>("users/me/2fa/disable", { method: "POST", body: { code } })
  },
}
