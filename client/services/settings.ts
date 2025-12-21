import { apiClient } from "@/lib/api"

export interface DataDeletionRequest {
  id: string
  userId: string
  status: "pending" | "processing" | "completed"
  createdAt: string
  completedAt?: string
  expectedCompletionDate?: string
}

/**
 * Clear local cache data
 */
export const clearCache = async (): Promise<void> => {
  // Clear localStorage items (except auth token)
  if (typeof window !== "undefined") {
    const authToken = localStorage.getItem("authToken")
    const keysToRemove: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key !== "authToken") {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
    
    // Restore auth token
    if (authToken) {
      localStorage.setItem("authToken", authToken)
    }
    
    // Clear sessionStorage
    sessionStorage.clear()
    
    // Clear any IndexedDB databases (if you're using them)
    if (window.indexedDB) {
      // List and clear any app-specific databases
      // This is a placeholder - implement based on your actual usage
    }
  }
  
  // Optionally call backend to clear server-side cache
  return Promise.resolve()
}

/**
 * Verify user password
 */
export const verifyPassword = async (password: string): Promise<boolean> => {
  return apiClient<boolean>("users/verify-password", {
    method: "POST",
    body: { password },
  })
}

/**
 * Delete user account
 */
export const deleteAccount = async (): Promise<void> => {
  return apiClient<void>("users/delete-account", {
    method: "DELETE",
  })
}

/**
 * Submit a data deletion request (GDPR)
 */
export const requestDataDeletion = async (): Promise<DataDeletionRequest> => {
  return apiClient<DataDeletionRequest>("users/data-deletion-request", {
    method: "POST",
  })
}

/**
 * Get the status of a pending data deletion request
 */
export const getDataDeletionStatus = async (): Promise<DataDeletionRequest | null> => {
  try {
    return await apiClient<DataDeletionRequest>("users/data-deletion-request/status", {
      method: "GET",
    })
  } catch (error) {
    // Return null if no pending request exists
    return null
  }
}
