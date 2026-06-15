import { apiClient } from "@/lib/api"

import type { AuthStorage, AuthResponse, CurrentUser } from "@/lib/storage"

// ─── Auth ─────────────────────────────────────────────────────────────────

export const auth: AuthStorage = {
  login: async (credentials) =>
    apiClient<AuthResponse>("api/v1/login", { method: "POST", body: credentials }),

  register: async (payload) =>
    apiClient<AuthResponse>("api/v1/register", { method: "POST", body: payload }),

  logout: async () => {
    await apiClient<void>("api/v1/logout", { method: "POST" })
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
        }
      }>("api/v1/users/me", { method: "GET" })
      const u = data.user
      const out: CurrentUser = {
        id: u.id,
        email: u.email,
        username: u.username,
        tag: u.usernameTag,
        role: u.role ?? "user",
        name: u.name ?? "",
        lastName: u.lastName ?? "",
      }
      return out
    } catch {
      return null
    }
  },
}
