//! OS keychain bridge for BYO AI provider keys.
//!
//! Exposes three Tauri commands (`secret_set`, `secret_get`, `secret_delete`)
//! that read and write secrets through the `keyring` crate, which in turn
//! talks to the platform-native secret store: macOS Keychain, Windows
//! Credential Manager, or the Linux Secret Service API (GNOME Keyring /
//! KWallet).
//!
//! Keys are namespaced under the service name `inkwell`; callers supply
//! their own account/key string, typically `ai.<provider-id>`. We never
//! log the secret value itself — only the key name and a generic failure
//! reason when something goes wrong.

use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "inkwell";

/// Error envelope returned to the frontend. The `message` is intended for
/// display; it contains the keyring error text but never the secret value.
#[derive(Debug, Serialize)]
pub struct SecretError {
    message: String,
}

impl From<keyring::Error> for SecretError {
    fn from(err: keyring::Error) -> Self {
        SecretError {
            message: err.to_string(),
        }
    }
}

/// Stores a secret under the given key, overwriting any previous value.
/// Returns `Ok(())` on success. Surface-level errors (missing backend,
/// locked keyring, permission denied) are flattened into `SecretError`.
#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), SecretError> {
    let entry = Entry::new(SERVICE, &key)?;
    entry.set_password(&value)?;
    Ok(())
}

/// Reads a secret by key. Returns `Ok(None)` when no entry exists rather
/// than erroring — callers use this to check "does the user have a key
/// saved" without trying a speculative decrypt.
#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, SecretError> {
    let entry = Entry::new(SERVICE, &key)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Deletes a secret by key. Missing entries are treated as success so the
/// frontend can call this idempotently on "clear key" actions without
/// first checking existence.
#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), SecretError> {
    let entry = Entry::new(SERVICE, &key)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
