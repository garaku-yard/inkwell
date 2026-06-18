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
  // Multipart, so it bypasses the JSON apiClient and posts FormData directly.
  uploadAvatar: async (file: File): Promise<string> => {
    const form = new FormData()
    form.append("image", file)
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/avatar`, {
      method: "POST",
      credentials: "include",
      body: form,
    })
    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("session-expired"))
      }
      throw new Error("Avatar upload failed")
    }
    const data = (await res.json()) as { user?: { avatarUrl?: string } }
    return data.user?.avatarUrl ?? ""
  },
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
