import type { SettingsStorage, UpdateProfileResponse } from "@/lib/storage"
import { ensureUserProfile, getDb, LOCAL_USER_ID, newId, now } from "./shared"

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
  changePassword: async () => {
    // No password exists locally; expose as no-op rather than rejecting so
    // the settings page doesn't feel broken.
  },
  verifyPassword: async () => true,
  deleteAccount: async () => {
    const db = await getDb()
    // Wipes everything. Irreversible.
    await db.execute("DELETE FROM projects")
    await db.execute("DELETE FROM workspaces")
    await db.execute("DELETE FROM user_profile")
  },
  requestDataDeletion: async () => ({
    id: newId(),
    userId: LOCAL_USER_ID,
    status: "completed",
    createdAt: now(),
    completedAt: now(),
  }),
  getDataDeletionStatus: async () => null,
  clearCache: async () => {
    if (typeof window !== "undefined") {
      localStorage.clear()
      sessionStorage.clear()
    }
  },
}
