use tauri_plugin_sql::{Migration, MigrationKind};

/// Schema migrations applied to the local SQLite database on startup. Keep
/// each migration immutable once shipped — edits to a previously released
/// version would desync existing users. Append new migrations with higher
/// version numbers instead.
fn sql_migrations() -> Vec<Migration> {
  vec![Migration {
    version: 1,
    description: "initial schema: projects, scenes, elements, characters, locations, beat board, workspaces",
    sql: include_str!("../migrations/0001_initial.sql"),
    kind: MigrationKind::Up,
  }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:inkwell.db", sql_migrations())
        .build(),
    )
    .setup(|app| {
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
