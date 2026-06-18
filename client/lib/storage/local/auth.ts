import type { AuthResponse, AuthStorage } from "@/lib/storage"
import { NotSupportedError } from "@/lib/storage"
import { ensureUserProfile, toAuthResponse } from "./shared"

// ─── Auth ─────────────────────────────────────────────────────────────────

export const auth: AuthStorage = {
  login: async (): Promise<AuthResponse> => {
    const me = await ensureUserProfile()
    return toAuthResponse(me)
  },
  register: async (): Promise<AuthResponse> => {
    const me = await ensureUserProfile()
    return toAuthResponse(me)
  },
  logout: async () => {
    // Local sessions don't exist; nothing to revoke.
  },
  me: async () => ensureUserProfile(),
  // The desktop app has no server-side session inventory.
  listSessions: async () => [],
  revokeSession: async () => {},
  // 2FA is a hosted-account feature; the desktop app has no auth server.
  enrollTwoFactor: async () => {
    throw new NotSupportedError("Two-factor auth isn't available on the desktop app")
  },
  confirmTwoFactor: async () => {
    throw new NotSupportedError("Two-factor auth isn't available on the desktop app")
  },
  disableTwoFactor: async () => {
    throw new NotSupportedError("Two-factor auth isn't available on the desktop app")
  },
}
