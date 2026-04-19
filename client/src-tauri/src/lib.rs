use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};
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
      // Native menu bar. Items emit `menu:<id>` events; the React layer
      // listens and responds. Predefined items (Quit, Cut, Copy, Paste…)
      // are handled by the OS, so we don't see them here.
      let app_handle = app.handle();

      let new_project = MenuItemBuilder::with_id("new_project", "New Project…")
        .accelerator("CmdOrCtrl+N")
        .build(app_handle)?;
      let open_dashboard = MenuItemBuilder::with_id("open_dashboard", "Dashboard")
        .accelerator("CmdOrCtrl+D")
        .build(app_handle)?;
      let open_settings = MenuItemBuilder::with_id("open_settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app_handle)?;

      let file = SubmenuBuilder::new(app_handle, "File")
        .item(&new_project)
        .item(&open_dashboard)
        .separator()
        .item(&open_settings)
        .separator()
        .item(&PredefinedMenuItem::quit(app_handle, None)?)
        .build()?;

      let edit = SubmenuBuilder::new(app_handle, "Edit")
        .item(&PredefinedMenuItem::undo(app_handle, None)?)
        .item(&PredefinedMenuItem::redo(app_handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app_handle, None)?)
        .item(&PredefinedMenuItem::copy(app_handle, None)?)
        .item(&PredefinedMenuItem::paste(app_handle, None)?)
        .item(&PredefinedMenuItem::select_all(app_handle, None)?)
        .build()?;

      let view = SubmenuBuilder::new(app_handle, "View")
        .item(&PredefinedMenuItem::fullscreen(app_handle, None)?)
        .build()?;

      let visit_github = MenuItemBuilder::with_id("visit_github", "Inkwell on GitHub")
        .build(app_handle)?;
      let about = MenuItemBuilder::with_id("about", "About Inkwell").build(app_handle)?;

      let help = SubmenuBuilder::new(app_handle, "Help")
        .item(&about)
        .item(&visit_github)
        .build()?;

      let menu = MenuBuilder::new(app_handle)
        .items(&[&file, &edit, &view, &help])
        .build()?;

      app.set_menu(menu)?;

      // Forward every non-predefined click to the frontend as a window
      // event. React pages listen and route the intent (new project modal,
      // navigation, external link, etc.).
      app.on_menu_event(move |app, event| {
        let id = event.id().as_ref().to_string();
        if let Some(window) = app.get_webview_window("main") {
          // The emit target is the main window; `None` at this callsite
          // would broadcast to every webview, which is not what we want.
          let _ = window.emit(&format!("menu:{id}"), ());
        }
      });

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
