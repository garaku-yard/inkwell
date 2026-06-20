/** Desktop-only auth transport seam.
 *
 *  Bridges the low-level HTTP client ({@link ./api}) to native persistence:
 *  the bearer token lives in the OS keychain (a secret) and the gateway-URL
 *  override lives in `localStorage` (not a secret). On the web build none of
 *  this runs — auth there is the httpOnly session cookie.
 *
 *  The flow it enables: at boot {@link initDesktopAuth} marks the HTTP client
 *  as native (so requests carry the desktop header and never send cookies),
 *  applies the stored gateway URL, and reloads a previously-saved token. The
 *  desktop auth domain then calls {@link persistAuthToken} on sign-in/out. */

import {
  setApiBaseUrl,
  setAuthToken,
  setNativeClient,
  setRefreshToken,
  setTokensRefreshedHandler,
} from "./api"
import { deleteSecret, getSecret, setSecret } from "./secrets"

/** localStorage key holding a user-configured gateway origin (not a secret). */
const GATEWAY_URL_KEY = "inkwell.gatewayUrl"
/** Keychain account holding the access (bearer) token for the linked account. */
const TOKEN_SECRET_KEY = "auth.token"
/** Keychain account holding the refresh token (renews the access token). */
const REFRESH_SECRET_KEY = "auth.refreshToken"

/** Writes (or deletes, when null) a secret, swallowing keychain errors. */
async function writeSecret(key: string, value: string | null): Promise<void> {
  try {
    if (value) await setSecret(key, value)
    else await deleteSecret(key)
  } catch {
    // Keychain locked/unavailable — in-memory state still applies for this run.
  }
}

/**
 * Returns the user's saved gateway override, or null when none is set (i.e.
 * the app uses the baked-in official default). Reads `localStorage`, so it is
 * a no-op returning null outside a browser/webview context.
 */
export function getStoredGatewayUrl(): string | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(GATEWAY_URL_KEY)
}

/**
 * Persists (or clears, with a blank value) the gateway override and applies it
 * to the live HTTP client immediately. Passing null/blank resets to the
 * default origin.
 *
 * @param url - Gateway origin (e.g. `https://inkwell.garakuyard.com`), or null.
 */
export function setStoredGatewayUrl(url: string | null): void {
  const trimmed = url?.trim()
  if (typeof localStorage !== "undefined") {
    if (trimmed) localStorage.setItem(GATEWAY_URL_KEY, trimmed)
    else localStorage.removeItem(GATEWAY_URL_KEY)
  }
  setApiBaseUrl(trimmed || undefined)
}

/**
 * Stores the access + refresh tokens both in memory (live HTTP client) and the
 * OS keychain so they survive a restart. Passing nulls clears both (sign-out).
 * Keychain failures are swallowed — the in-memory tokens are still applied so
 * the current session works even if persistence is unavailable.
 *
 * @param access - Raw JWT access token, or null to sign out.
 * @param refresh - Refresh token, or null.
 */
export async function persistTokens(access: string | null, refresh: string | null): Promise<void> {
  setAuthToken(access)
  setRefreshToken(refresh)
  await writeSecret(TOKEN_SECRET_KEY, access)
  await writeSecret(REFRESH_SECRET_KEY, refresh)
}

/**
 * Initialises native auth transport at desktop boot: marks the HTTP client as
 * the native client, applies any stored gateway override, reloads persisted
 * tokens from the keychain (so a previously signed-in user stays signed in),
 * and registers the auto-refresh persistence hook so rotated tokens are saved.
 * Safe to call once before the app renders.
 */
export async function initDesktopAuth(): Promise<void> {
  setNativeClient(true)
  setApiBaseUrl(getStoredGatewayUrl() || undefined)
  // Persist tokens rotated by the HTTP client's auto-refresh-on-401.
  setTokensRefreshedHandler((access, refresh) => {
    void writeSecret(TOKEN_SECRET_KEY, access)
    void writeSecret(REFRESH_SECRET_KEY, refresh || null)
  })
  try {
    const [access, refresh] = await Promise.all([
      getSecret(TOKEN_SECRET_KEY),
      getSecret(REFRESH_SECRET_KEY),
    ])
    if (access) setAuthToken(access)
    if (refresh) setRefreshToken(refresh)
  } catch {
    // Keychain unavailable — treat as signed out; the user can re-link.
  }
}
