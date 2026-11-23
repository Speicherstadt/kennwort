//! The three commands the webview may call to reach its server (docs/plan.md, Entscheidungen,
//! "Server der App"): `server_get` and `server_set` for the one origin set up at the first start,
//! `server_fetch` for each API call, checked in bridge.rs and sent by the platform's own HTTP
//! client (Android: ServerPlugin.kt, which follows no redirect). Nothing here logs a request or an
//! answer: they carry session tokens and ciphertexts.

use std::path::PathBuf;

use tauri::{
  AppHandle, Manager, Runtime,
  plugin::{Builder, TauriPlugin},
};

use crate::bridge::{
  ApiRequest, ApiResponse, NativeRequest, checked_response, native_request, read_origin,
  store_origin,
};
use crate::server::Refusal;

fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, Refusal> {
  app.path().app_data_dir().map_err(|_| Refusal::StorageFailed)
}

#[tauri::command]
pub fn server_get<R: Runtime>(app: AppHandle<R>) -> Option<String> {
  data_dir(&app).ok().and_then(|dir| read_origin(&dir))
}

#[tauri::command]
pub fn server_set<R: Runtime>(app: AppHandle<R>, typed: String) -> Result<String, &'static str> {
  data_dir(&app).and_then(|dir| store_origin(&dir, &typed)).map_err(Refusal::code)
}

#[tauri::command]
pub async fn server_fetch<R: Runtime>(
  app: AppHandle<R>,
  request: ApiRequest,
) -> Result<ApiResponse, &'static str> {
  let origin = data_dir(&app).ok().and_then(|dir| read_origin(&dir));
  let native = native_request(origin.as_deref(), request).map_err(Refusal::code)?;
  send(&app, native).await.and_then(checked_response).map_err(Refusal::code)
}

/// The platform's HTTP client. Its error text is dropped unread: it may name the address
#[cfg(target_os = "android")]
async fn send<R: Runtime>(app: &AppHandle<R>, request: NativeRequest) -> Result<ApiResponse, Refusal> {
  let native = app.try_state::<NativeHttp<R>>().ok_or(Refusal::Unsupported)?;
  native.0.run_mobile_plugin_async("fetch", request).await.map_err(|_| Refusal::Unreachable)
}

/// iOS gets its client later, built on a Mac (docs/handy.md); `tauri dev` on a desktop has none
#[cfg(not(target_os = "android"))]
async fn send<R: Runtime>(_app: &AppHandle<R>, _request: NativeRequest) -> Result<ApiResponse, Refusal> {
  Err(Refusal::Unsupported)
}

#[cfg(target_os = "android")]
struct NativeHttp<R: Runtime>(tauri::plugin::PluginHandle<R>);

/// Loads the Kotlin client. The plugin has no commands of its own and no permission in the
/// capabilities, so the webview cannot call it past the checks in bridge.rs
pub fn native_http<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("kennwort-server")
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      app.manage(NativeHttp(api.register_android_plugin("app.kennwort", "ServerPlugin")?));
      #[cfg(not(target_os = "android"))]
      let _ = (app, api);
      Ok(())
    })
    .build()
}
