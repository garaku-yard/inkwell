use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

mod open_file;
mod scope;
mod secrets;

/// Schema migrations applied to the local SQLite database on startup. Keep
/// each migration immutable once shipped — edits to a previously released
/// version would desync existing users. Append new migrations with higher
/// version numbers instead.
fn sql_migrations() -> Vec<Migration> {
  vec![
    Migration {
      version: 1,
      description: "initial schema: projects, scenes, elements, characters, locations, beat board, workspaces",
      sql: include_str!("../migrations/0001_initial.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "vault support: projects.vault_path column",
      sql: include_str!("../migrations/0002_vault.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "vault backlinks index: note_links table",
      sql: include_str!("../migrations/0003_note_links.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "vault tags index: note_tags table",
      sql: include_str!("../migrations/0004_note_tags.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "AI provider BYO-key settings: ai_providers table (keys in OS keychain)",
      sql: include_str!("../migrations/0005_ai_providers.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 6,
      description: "vault-as-knowledge: note_embeddings index for RAG retrieval",
      sql: include_str!("../migrations/0006_note_embeddings.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 7,
      description: "vault-as-knowledge: project_knowledge scope mapping",
      sql: include_str!("../migrations/0007_project_knowledge.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 8,
      description: "drop screenplay-only script_elements.character_id (always NULL, unused)",
      sql: include_str!("../migrations/0008_drop_element_character_id.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 9,
      description: "sync foundation: deleted_at tombstones + updated_at on beat-board tables",
      sql: include_str!("../migrations/0009_sync.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 10,
      description: "sync_state: per-project desktop sync engine state",
      sql: include_str!("../migrations/0010_sync_state.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 11,
      description: "sync_outbox: incremental-push change log (only changed rows sync)",
      sql: include_str!("../migrations/0011_sync_outbox.sql"),
      kind: MigrationKind::Up,
    },
  ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // The native menu bar is intentionally omitted: the OS chrome doesn't
  // honour the in-app theme, and Inkwell's custom titlebar already
  // exposes the important actions. Keyboard shortcuts (Ctrl+N, etc.)
  // are re-registered on the JS side by `DesktopMenuBridge`.
  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:inkwell.db", sql_migrations())
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .manage(open_file::PendingOpenFile::default())
    .invoke_handler(tauri::generate_handler![
      secrets::secret_set,
      secrets::secret_get,
      secrets::secret_delete,
      open_file::consume_pending_open_file,
      scope::allow_fs_dir,
    ])
    .setup(|app| {
      // Make sure the window advertises the bundle icon on platforms that
      // look at the window's own icon (most Linux WMs, Windows taskbar).
      // Without this the taskbar often falls back to a generic icon in
      // dev mode where no .desktop file is installed.
      if let Some(icon) = app.default_window_icon().cloned() {
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.set_icon(icon);
        }
      }

      // Windows + Linux deliver a double-clicked file as a CLI arg on
      // launch. macOS uses RunEvent::Opened (handled below) once the
      // event loop is running, so this scan is a no-op there.
      if let Some(path) = open_file::detect_open_file_arg(std::env::args()) {
        open_file::record_pending(&app.handle(), path);
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, _event| {
      // RunEvent::Opened fires on macOS / iOS when the user double-clicks
      // an associated file for an already-running app. The variant is
      // gated by Tauri behind those targets, so we only build the match
      // arm there. Windows + Linux receive the path via CLI args and
      // the setup() scan above is enough.
      #[cfg(any(target_os = "macos", target_os = "ios"))]
      if let tauri::RunEvent::Opened { urls } = _event {
        for url in urls {
          if let Ok(path) = url.to_file_path() {
            if let Some(s) = path.to_str() {
              open_file::record_pending(_app_handle, s.to_string());
            }
          }
        }
      }
    });
}
