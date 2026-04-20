use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

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

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
