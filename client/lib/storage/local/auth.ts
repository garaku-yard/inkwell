import type { AuthResponse, AuthStorage } from "@/lib/storage"
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
}
