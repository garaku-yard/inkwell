import { apiClient } from "@/lib/api"

import type { AuthStorage, AuthResponse, CurrentUser, Session, TwoFactorEnrollment } from "@/lib/storage"

// ─── Auth ─────────────────────────────────────────────────────────────────

export const auth: AuthStorage = {
  login: async (credentials) =>
    apiClient<AuthResponse>("login", { method: "POST", body: credentials }),

  register: async (payload) =>
    apiClient<AuthResponse>("register", { method: "POST", body: payload }),

  logout: async () => {
    await apiClient<void>("logout", { method: "POST" })
  },

  me: async () => {
    try {
      const data = await apiClient<{
        user: {
          id: string
          email: string
          username: string
          usernameTag: string
          name: string
          lastName: string
          role?: string
          avatarUrl?: string
          twoFactorEnabled?: boolean
        }
      }>("users/me", { method: "GET" })
      const u = data.user
      const out: CurrentUser = {
        id: u.id,
        email: u.email,
        username: u.username,
        tag: u.usernameTag,
        role: u.role ?? "user",
        name: u.name ?? "",
        lastName: u.lastName ?? "",
        avatarUrl: u.avatarUrl,
        twoFactorEnabled: u.twoFactorEnabled ?? false,
      }
      return out
    } catch {
      return null
    }
  },

  listSessions: async (): Promise<Session[]> =>
    apiClient<Session[]>("users/me/sessions", { method: "GET" }),

  revokeSession: async (id: string): Promise<void> => {
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
