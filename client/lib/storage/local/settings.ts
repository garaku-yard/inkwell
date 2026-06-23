import type { DataDeletionRequest, SettingsStorage, UpdateProfileResponse } from "@/lib/storage"
import { NotSupportedError } from "@/lib/storage"
import { apiClient, getAuthToken } from "@/lib/api"
import { ensureUserProfile, getDb, now } from "./shared"

// ─── Settings (local profile + BYO-key AI keys land here) ────────────────

export const settings: SettingsStorage = {
  updateProfile: async (data) => {
    const me = await ensureUserProfile()
    const db = await getDb()
    const ts = now()
    await db.execute(
      `UPDATE user_profile SET username = COALESCE(?, username), email = COALESCE(?, email), updated_at = ? WHERE id = ?`,
      [data.username ?? null, data.email ?? null, ts, me.id],
    )
    const updated = await ensureUserProfile()
    const resp: UpdateProfileResponse = {
      id: updated.id,
      username: updated.username,
      usernameTag: updated.tag,
      name: updated.name,
      lastName: updated.lastName,
      email: updated.email,
    }
    return resp
  },
  uploadAvatar: async () => {
    // Avatars are a hosted feature (uploaded to the gateway). The desktop app
    // has no avatar storage today.
    throw new NotSupportedError("Avatar upload isn't available on the desktop app")
  },
  // The account ops below only make sense against a cloud account. The Settings
  // UI hides these sections on desktop until an account is linked, but we still
  // route honestly here: when signed in, hit the gateway (so they actually work);
  // when not, throw instead of faking success (no password exists locally to
  // change, no server to receive a GDPR request).
  changePassword: async (currentPassword, newPassword) => {
    if (!getAuthToken()) throw new NotSupportedError("Changing your password needs a linked cloud account")
    await apiClient<void>("users/me/password", { method: "POST", body: { currentPassword, newPassword } })
  },
  verifyPassword: async (password) => {
    if (!getAuthToken()) throw new NotSupportedError("Password verification needs a linked cloud account")
    return apiClient<boolean>("users/verify-password", { method: "POST", body: { password } })
  },
  deleteAccount: async () => {
    // When linked, delete the cloud account first; then wipe local data either
    // way (the desktop copy lives in SQLite regardless of an account).
    if (getAuthToken()) {
      await apiClient<void>("users/delete-account", { method: "DELETE" })
    }
    const db = await getDb()
    await db.execute("DELETE FROM projects")
    await db.execute("DELETE FROM workspaces")
    await db.execute("DELETE FROM user_profile")
  },
  requestDataDeletion: async () => {
    if (!getAuthToken()) throw new NotSupportedError("Data-deletion requests need a linked cloud account")
    return apiClient<DataDeletionRequest>("users/data-deletion-request", { method: "POST" })
  },
  getDataDeletionStatus: async () => {
    if (!getAuthToken()) return null
    try {
      return await apiClient<DataDeletionRequest>("users/data-deletion-request/status", { method: "GET" })
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
