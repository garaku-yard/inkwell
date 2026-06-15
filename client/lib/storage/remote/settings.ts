import { apiClient } from "@/lib/api"

import type {
  DataDeletionRequest,
  SettingsStorage,
  UpdateProfileResponse,
} from "@/lib/storage"

// ─── Settings ─────────────────────────────────────────────────────────────

export const settings: SettingsStorage = {
  updateProfile: (data) =>
    apiClient<UpdateProfileResponse>("users/me", { method: "PATCH", body: data }),
  changePassword: async (currentPassword, newPassword) => {
    await apiClient<void>("users/me/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    })
  },
  verifyPassword: (password) =>
    apiClient<boolean>("users/verify-password", {
      method: "POST",
      body: { password },
    }),
  deleteAccount: async () => {
    await apiClient<void>("users/delete-account", { method: "DELETE" })
  },
  requestDataDeletion: () =>
    apiClient<DataDeletionRequest>("users/data-deletion-request", { method: "POST" }),
  getDataDeletionStatus: async () => {
    try {
      return await apiClient<DataDeletionRequest>("users/data-deletion-request/status", {
        method: "GET",
      })
    } catch {
      return null
    }
  },
  clearCache: async () => {
    if (typeof window !== "undefined") {
      localStorage.clear()
      sessionStorage.clear()
    }
  },
}
