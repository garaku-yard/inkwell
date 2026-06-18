/** Settings service — thin wrappers around the Storage abstraction for
 *  profile/password/account operations. */
import { getStorage } from "@/lib/storage"

export interface DataDeletionRequest {
  id: string
  userId: string
  status: "pending" | "processing" | "completed"
  createdAt: string
  completedAt?: string
  expectedCompletionDate?: string
}

export interface UpdateProfileData {
  username?: string
  email?: string
}

export interface UpdateProfileResponse {
  id: string
  username: string
  usernameTag: string
  name: string
  lastName: string
  email: string
}

export const updateUserProfile = (data: UpdateProfileData): Promise<UpdateProfileResponse> =>
  getStorage().settings.updateProfile(data)

/** Upload a new avatar image; resolves to the stored URL (hosted only). */
export const uploadAvatar = (file: File): Promise<string> =>
  getStorage().settings.uploadAvatar(file)

export const changePassword = (
  currentPassword: string,
  newPassword: string,
): Promise<void> => getStorage().settings.changePassword(currentPassword, newPassword)

export const clearCache = (): Promise<void> => getStorage().settings.clearCache()

export const verifyPassword = (password: string): Promise<boolean> =>
  getStorage().settings.verifyPassword(password)

export const deleteAccount = (): Promise<void> => getStorage().settings.deleteAccount()

export const requestDataDeletion = (): Promise<DataDeletionRequest> =>
  getStorage().settings.requestDataDeletion()

export const getDataDeletionStatus = (): Promise<DataDeletionRequest | null> =>
  getStorage().settings.getDataDeletionStatus()
