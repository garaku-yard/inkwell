import type {
  DataDeletionRequest,
  UpdateProfileData,
  UpdateProfileResponse,
} from "@/services/settings"

// ─── Settings ─────────────────────────────────────────────────────────────

export interface SettingsStorage {
  updateProfile(data: UpdateProfileData): Promise<UpdateProfileResponse>
  /** Upload a new avatar image; resolves to the stored URL. Hosted-only —
   *  the local (desktop) impl rejects with NotSupportedError. */
  uploadAvatar(file: File): Promise<string>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  verifyPassword(password: string): Promise<boolean>
  deleteAccount(): Promise<void>
  requestDataDeletion(): Promise<DataDeletionRequest>
  getDataDeletionStatus(): Promise<DataDeletionRequest | null>
  /** Pure client-side cache wipe. Implementations that don't keep a cache can
   *  no-op. */
  clearCache(): Promise<void>
}
