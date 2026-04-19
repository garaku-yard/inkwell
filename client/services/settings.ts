/** Settings service — profile updates, password management, and account/data-deletion operations. */
import { apiClient } from "@/lib/api"

/** Tracks the lifecycle of a GDPR data-deletion request. */
export interface DataDeletionRequest {
  /** UUID of the deletion request. */
  id: string;
  /** UUID of the user who submitted the request. */
  userId: string;
  /** Current processing state. */
  status: "pending" | "processing" | "completed";
  /** ISO 8601 timestamp of when the request was submitted. */
  createdAt: string;
  /** ISO 8601 timestamp of when deletion was completed, if finished. */
  completedAt?: string;
  /** ISO 8601 timestamp of the latest expected completion date, if provided. */
  expectedCompletionDate?: string;
}

/** Fields accepted by the profile-update endpoint. */
export interface UpdateProfileData {
  /** New username (must be unique). */
  username?: string;
  /** New email address. */
  email?: string;
}

/** Profile data returned after a successful update. */
export interface UpdateProfileResponse {
  /** UUID of the user. */
  id: string;
  /** Updated username. */
  username: string;
  /** Numeric discriminator tag appended to the username (e.g. `"#1234"`). */
  usernameTag: string;
  /** First name. */
  name: string;
  /** Last name. */
  lastName: string;
  /** Updated email address. */
  email: string;
}

/**
 * Updates the authenticated user's profile fields (username or email).
 * Only fields present in `data` are changed.
 *
 * @param data - Profile fields to update.
 * @returns A promise that resolves to the updated profile.
 * @throws {Error} When the new username or email is already taken.
 *
 * @example
 * ```ts
 * const profile = await updateUserProfile({ username: "alice_new" });
 * ```
 */
export const updateUserProfile = async (data: UpdateProfileData): Promise<UpdateProfileResponse> => {
  return apiClient<UpdateProfileResponse>("users/me", {
    method: "PATCH",
    body: data,
  })
}

/**
 * Changes the authenticated user's password after verifying the current one.
 *
 * @param currentPassword - The user's existing password for verification.
 * @param newPassword - The new password to set.
 * @returns A promise that resolves when the password has been changed.
 * @throws {Error} When the current password is incorrect.
 */
export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  return apiClient<void>("users/me/password", {
    method: "POST",
    body: { currentPassword, newPassword },
  })
}

/**
 * Clears all client-side cached data from `localStorage` and `sessionStorage`.
 * Does not make a network request and does not affect the session — the JWT
 * lives in an httpOnly cookie managed by the gateway.
 *
 * **Side effects:** Calls `localStorage.clear()` and `sessionStorage.clear()`.
 *
 * @returns A promise that resolves immediately after clearing local storage.
 */
export const clearCache = async (): Promise<void> => {
  if (typeof window !== "undefined") {
    localStorage.clear()
    sessionStorage.clear()
  }

  return Promise.resolve()
}

/**
 * Verifies the user's current password without changing it. Useful as a
 * confirmation step before destructive account actions.
 *
 * @param password - Password to verify.
 * @returns A promise that resolves to `true` if correct, `false` otherwise.
 */
export const verifyPassword = async (password: string): Promise<boolean> => {
  return apiClient<boolean>("users/verify-password", {
    method: "POST",
    body: { password },
  })
}

/**
 * Permanently deletes the authenticated user's account and all associated data.
 * This action is irreversible.
 *
 * @returns A promise that resolves when the account has been deleted.
 */
export const deleteAccount = async (): Promise<void> => {
  return apiClient<void>("users/delete-account", {
    method: "DELETE",
  })
}

/**
 * Submits a GDPR data-deletion request. The server will schedule deletion and
 * return a tracking record. Only one pending request may exist at a time.
 *
 * @returns A promise that resolves to the newly created deletion request.
 * @throws {Error} When a pending request already exists for this user.
 */
export const requestDataDeletion = async (): Promise<DataDeletionRequest> => {
  return apiClient<DataDeletionRequest>("users/data-deletion-request", {
    method: "POST",
  })
}

/**
 * Checks the status of a pending data-deletion request.
 *
 * @returns A promise that resolves to the deletion request, or `null` if none exists.
 */
export const getDataDeletionStatus = async (): Promise<DataDeletionRequest | null> => {
  try {
    return await apiClient<DataDeletionRequest>("users/data-deletion-request/status", {
      method: "GET",
    })
  } catch {
    return null
  }
}
