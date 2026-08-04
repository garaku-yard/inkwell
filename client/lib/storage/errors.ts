/**
 * Errors thrown by any Storage implementation. UI code should catch these
 * and branch on type rather than on string comparison.
 */

/** Base class for all storage-layer failures. */
export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = "StorageError"
  }
}

/**
 * Thrown when a Storage implementation is asked for a capability it has not
 * declared in {@link Storage.capabilities}. Example: the desktop/local build
 * rejects {@link Storage.collaboration} operations with this error so UI code
 * can hide the feature instead of surfacing the raw exception.
 */
export class NotSupportedError extends StorageError {
  constructor(feature: string) {
    super(`This build does not support the "${feature}" feature.`)
    this.name = "NotSupportedError"
  }
}

/** Thrown when the caller is not authenticated. The remote implementation
 *  maps HTTP 401 to this; the local implementation throws it when offline
 *  operations require a user record that doesn't exist yet. */
export class UnauthenticatedError extends StorageError {
  /** @param message - Optional caller-supplied copy. Prefer passing something
   *  that names the action being refused: this reaches the UI verbatim in
   *  places that render `err.message`, and "Not authenticated." tells a user
   *  neither what failed nor what to do about it. */
  constructor(message = "Not authenticated.") {
    super(message)
    this.name = "UnauthenticatedError"
  }
}

/** Thrown when the requested entity does not exist. */
export class NotFoundError extends StorageError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found.`)
    this.name = "NotFoundError"
  }
}
