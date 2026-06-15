//! Runtime filesystem-scope grants.
//!
//! The app ships with NO broad static fs/asset scope (see capabilities +
//! tauri.conf). The only paths the desktop app legitimately touches are the
//! user-chosen vault folder and a file the user explicitly opens to import
//! (e.g. a `.fdx`). Those paths aren't known until the user acts, so instead
//! of granting recursive access to the whole home directory up front, the
//! frontend calls `allow_fs_dir` with the resolved path before it reads/writes
//! there. This adds just that subtree to both the fs-plugin scope (read/write)
//! and the asset-protocol scope (so local images in notes load via asset://).
//! Scopes are per-process, so the frontend re-grants on every session.

use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

/// Adds `path` to the fs and asset-protocol scopes for this session. When
/// `recursive` is true the whole subtree is allowed (used for the vault
/// folder); when false only direct children are (used for the directory
/// holding a one-off imported file). Idempotent — re-granting is harmless.
#[tauri::command]
pub fn allow_fs_dir(app: AppHandle, path: String, recursive: bool) -> Result<(), String> {
    let dir = std::path::PathBuf::from(&path);

    app.fs_scope()
        .allow_directory(&dir, recursive)
        .map_err(|e| format!("fs scope: {e}"))?;

    app.asset_protocol_scope()
        .allow_directory(&dir, recursive)
        .map_err(|e| format!("asset scope: {e}"))?;

    Ok(())
}
