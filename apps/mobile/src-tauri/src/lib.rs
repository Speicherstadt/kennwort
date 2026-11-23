//! The Rust side of Kennwort's mobile app stays thin (docs/plan.md, "Handy und Mobile-App"): it
//! opens one webview on the web app's bundled build and nothing else. Keys, unlocking and matching
//! live in the TypeScript packages inside the webview; the native autofill plugins of K-802 call
//! that same code through the bridge in apps/mobile/src/autofill, never a second copy in Rust.

mod clipboard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .runtime(tauri_runtime_wry::Wry::default())
    .plugin(clipboard::init())
    .invoke_handler(tauri::generate_handler![clipboard::copy_secret])
    .run(tauri::generate_context!())
    .expect("error while running Kennwort");
}
