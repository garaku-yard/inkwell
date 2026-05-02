//! Captures a file path the OS asked Inkwell to open and exposes it to
//! the frontend on demand.
//!
//! On Windows and Linux file associations launch a fresh Inkwell process
//! with the target path appended to the CLI args. On macOS the same flow
//! arrives later via `RunEvent::Opened` (handled in `lib.rs`). Both paths
//! drop into the same `PendingOpenFile` state, which the frontend drains
//! via `consume_pending_open_file()` once the editor UI mounts and is
//! ready to prompt the user.

use std::path::Path;
use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Holds at most one pending file path. The frontend reads it via
/// `consume_pending_open_file` and the slot clears as a side effect so
/// a slow listener can't trigger the import dialog twice.
#[derive(Default)]
pub struct PendingOpenFile(pub Mutex<Option<String>>);

/// Walks `argv` looking for a file path the user wants Inkwell to open.
/// Skips the executable itself plus any `--flag` or `--key=value` Tauri
/// dev-mode arguments. Returns the first arg that points at an existing
/// file with a supported extension; everything else is ignored so a
/// stray argument can't masquerade as a document to import.
pub fn detect_open_file_arg(argv: impl IntoIterator<Item = String>) -> Option<String> {
    const SUPPORTED_EXTS: &[&str] = &["fdx"];

    let mut iter = argv.into_iter();
    iter.next(); // skip executable

    for arg in iter {
        if arg.starts_with('-') {
            continue;
        }
        let path = Path::new(&arg);
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !SUPPORTED_EXTS.contains(&ext.to_ascii_lowercase().as_str()) {
            continue;
        }
        if !path.is_file() {
            continue;
        }
        // Canonicalise so the frontend always receives an absolute
        // path, which simplifies the @tauri-apps/plugin-fs read step.
        let absolute = path
            .canonicalize()
            .ok()
            .and_then(|p| p.to_str().map(|s| s.to_string()))
            .unwrap_or(arg);
        return Some(absolute);
    }
    None
}

/// Stores `path` into the shared slot if the slot is empty. Multiple
/// pending paths in one session are unusual (only one file can be
/// double-clicked at a time on most desktops); when they happen we
/// keep the first one and emit the rest as live `open-file` events
/// for any already-mounted listener.
pub fn record_pending<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: String) {
    if let Some(state) = app.try_state::<PendingOpenFile>() {
        let mut guard = state.0.lock().expect("PendingOpenFile mutex poisoned");
        if guard.is_none() {
            *guard = Some(path.clone());
            return;
        }
    }
    let _ = app.emit("open-file", path);
}

/// Drains the pending slot and returns the path, if any. The frontend
/// invokes this after the dashboard mounts; subsequent calls return
/// `None` so a remount doesn't re-prompt the user.
#[tauri::command]
pub fn consume_pending_open_file(state: tauri::State<'_, PendingOpenFile>) -> Option<String> {
    let mut guard = state.0.lock().expect("PendingOpenFile mutex poisoned");
    guard.take()
}
