/** Thin wrapper around the Rust `secret_*` Tauri commands.
 *
 *  Secrets live in the OS keychain (macOS Keychain, Windows Credential
 *  Manager, or Linux Secret Service via the `inkwell` service namespace).
 *  Values never touch SQLite or the filesystem.
 *
 *  Desktop-only. These calls fail on the web build because there's no
 *  Tauri runtime to invoke; callers guard by only instantiating the local
 *  Storage implementation when `isTauri()` is true. */

import { invoke } from "@tauri-apps/api/core"

/** Store a secret under `key`, overwriting any previous value.
 *
 *  @param key - Account identifier inside the `inkwell` service namespace.
 *    Convention: `ai.<provider-id>` for AI provider keys.
 *  @param value - Plaintext secret. The keyring plugin handles encryption
 *    at rest; callers should not pre-encrypt.
 *  @throws When the backend keyring is locked, missing, or rejects the
 *    write (e.g. no Secret Service daemon running on Linux). */
export async function setSecret(key: string, value: string): Promise<void> {
  await invoke("secret_set", { key, value })
}

/** Read a secret by `key`. Returns `null` when no entry exists so the
 *  caller can branch without catching "not found" errors. */
export async function getSecret(key: string): Promise<string | null> {
  const result = await invoke<string | null>("secret_get", { key })
  return result ?? null
}

/** Delete a secret by `key`. Missing entries are treated as success, so
 *  this is safe to call idempotently from "clear key" actions. */
export async function deleteSecret(key: string): Promise<void> {
  await invoke("secret_delete", { key })
}
