//! The Rust side of Kennwort's mobile app stays thin (docs/plan.md, "Handy und Mobile-App"): it
//! opens one webview on the web app's bundled build and passes its API calls on to the one server
//! the user set up (commands.rs, bridge.rs, server.rs), so the CSP keeps `connect-src 'self'`.
//! Keys, unlocking and matching live in the TypeScript packages inside the webview; the native
//! autofill plugins of K-802 call that same code through the bridge in apps/mobile/src/autofill.

// Without the shell only the tests use the rules (Cargo.toml, features)
#![cfg_attr(not(feature = "shell"), allow(dead_code))]

mod bridge;
#[cfg(feature = "shell")]
mod commands;
mod server;

#[cfg(feature = "shell")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .runtime(tauri_runtime_wry::Wry::default())
    .plugin(commands::native_http())
    .invoke_handler(tauri::generate_handler![
      commands::server_get,
      commands::server_set,
      commands::server_fetch
    ])
    .run(tauri::generate_context!())
    .expect("error while running Kennwort");
}
