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

import { setApiBaseUrl, setAuthToken, setNativeClient } from "./api"
import { deleteSecret, getSecret, setSecret } from "./secrets"

/** localStorage key holding a user-configured gateway origin (not a secret). */
const GATEWAY_URL_KEY = "inkwell.gatewayUrl"
/** Keychain account holding the bearer token for the linked remote account. */
const TOKEN_SECRET_KEY = "auth.token"

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
 * Stores the bearer token both in memory (live HTTP client) and the OS
 * keychain so it survives a restart. Passing null clears both. Keychain
 * failures are swallowed — the in-memory token is still applied so the current
 * session works even if persistence is unavailable.
 *
 * @param token - Raw JWT from a successful login/register, or null to sign out.
 */
export async function persistAuthToken(token: string | null): Promise<void> {
  setAuthToken(token)
  try {
    if (token) await setSecret(TOKEN_SECRET_KEY, token)
    else await deleteSecret(TOKEN_SECRET_KEY)
  } catch {
    // Keychain locked/unavailable — in-memory token still set for this run.
  }
}

/**
 * Initialises native auth transport at desktop boot: marks the HTTP client as
 * the native client, applies any stored gateway override, and reloads a
 * persisted token from the keychain so a previously signed-in user stays
 * signed in across launches. Safe to call once before the app renders.
 */
export async function initDesktopAuth(): Promise<void> {
  setNativeClient(true)
  setApiBaseUrl(getStoredGatewayUrl() || undefined)
  try {
    const token = await getSecret(TOKEN_SECRET_KEY)
    if (token) setAuthToken(token)
  } catch {
    // Keychain unavailable — treat as signed out; the user can re-link.
  }
}
