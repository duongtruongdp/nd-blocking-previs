use tauri::{Emitter, Manager};

#[tauri::command]
fn startup_project_path() -> Option<String> {
    std::env::args().skip(1).find(|argument| is_project_path(argument))
}

fn is_project_path(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".ndblock")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(path) = args.iter().rev().find(|argument| is_project_path(argument)) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
                let _ = app.emit("nd://open-project", path);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![startup_project_path])
        .run(tauri::generate_context!())
        .expect("error while running ND Blocking & Previs");
}
