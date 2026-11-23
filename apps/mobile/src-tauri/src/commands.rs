//! The commands the webview may call to reach its server (docs/plan.md, Entscheidungen,
//! "Server der App"): `server_get` and `server_set` for the one origin set up at the first start,
//! `server_fetch` for each API call, checked in bridge.rs and sent by the platform's own HTTP
//! client (Android: ServerPlugin.kt, which follows no redirect). `server_stream` opens one of the
//! two live streams (K-708, live.rs) and passes its events through a Tauri channel, each through the
//! gate in live.rs; `server_stream_close` ends it (the webview calls it at the lock and the logout,
//! when it stops listening). Nothing here logs a request, an answer or an event: they carry session
//! tokens and ciphertexts.

use std::{
  path::PathBuf,
  sync::{
    Mutex,
    atomic::{AtomicU32, Ordering},
  },
  time::{SystemTime, UNIX_EPOCH},
};

use tauri::{
  AppHandle, Manager, Runtime,
  ipc::{Channel, InvokeResponseBody},
  plugin::{Builder, TauriPlugin},
};

use crate::bridge::{
  ApiRequest, ApiResponse, NativeRequest, checked_response, native_request, read_origin,
  store_origin,
};
use crate::live::{
  Bucket, Gate, NativeMessage, NativeStream, StreamMessage, StreamRequest, native_stream, pass,
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

/// The next stream's number; Kotlin keys its open connections by it
static NEXT_STREAM: AtomicU32 = AtomicU32::new(1);

fn now_ms() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// Opens a live stream; resolves with its number once it is asked for, the events follow on
/// `on_event` until an `end` message
#[tauri::command]
pub async fn server_stream<R: Runtime>(
  app: AppHandle<R>,
  request: StreamRequest,
  on_event: Channel<StreamMessage>,
) -> Result<u32, &'static str> {
  let origin = data_dir(&app).ok().and_then(|dir| read_origin(&dir));
  let id = NEXT_STREAM.fetch_add(1, Ordering::Relaxed);
  let native = native_stream(origin.as_deref(), id, request).map_err(Refusal::code)?;
  // Every message of the platform's client goes through the gate; after an end, nothing more
  let gate = Mutex::new(Gate::Open(Bucket::full(now_ms())));
  let closer = app.clone();
  let from_native = Channel::<serde_json::Value>::new(move |body| {
    let InvokeResponseBody::Json(json) = body else {
      return Ok(());
    };
    let message = serde_json::from_str::<NativeMessage>(&json).unwrap_or(NativeMessage {
      event: None,
      data: None,
      end: None,
    });
    let Ok(mut state) = gate.lock() else {
      return Ok(());
    };
    let (next, out) = pass(*state, message, now_ms());
    let ended = matches!((*state, next), (Gate::Open(_), Gate::Closed));
    *state = next;
    drop(state);
    if let Some(out) = out {
      let _ = on_event.send(out);
    }
    if ended {
      // A limit the gate saw first: the platform's client stops reading too
      let app = closer.clone();
      tauri::async_runtime::spawn(async move { close(&app, id).await });
    }
    Ok(())
  });
  open(&app, native, from_native).await.map_err(Refusal::code)?;
  Ok(id)
}

#[tauri::command]
pub async fn server_stream_close<R: Runtime>(app: AppHandle<R>, id: u32) {
  close(&app, id).await;
}

#[cfg(target_os = "android")]
#[derive(serde::Serialize)]
struct OpenArgs {
  #[serde(flatten)]
  stream: NativeStream,
  channel: Channel<serde_json::Value>,
}

#[cfg(target_os = "android")]
async fn open<R: Runtime>(
  app: &AppHandle<R>,
  stream: NativeStream,
  channel: Channel<serde_json::Value>,
) -> Result<(), Refusal> {
  let native = app.try_state::<NativeHttp<R>>().ok_or(Refusal::Unsupported)?;
  native
    .0
    .run_mobile_plugin_async::<serde_json::Value>("stream", OpenArgs { stream, channel })
    .await
    .map(|_| ())
    .map_err(|_| Refusal::Unreachable)
}

#[cfg(target_os = "android")]
async fn close<R: Runtime>(app: &AppHandle<R>, id: u32) {
  if let Some(native) = app.try_state::<NativeHttp<R>>() {
    let args = serde_json::json!({ "id": id });
    let _ = native.0.run_mobile_plugin_async::<serde_json::Value>("close", args).await;
  }
}

#[cfg(not(target_os = "android"))]
async fn open<R: Runtime>(
  _app: &AppHandle<R>,
  _stream: NativeStream,
  _channel: Channel<serde_json::Value>,
) -> Result<(), Refusal> {
  Err(Refusal::Unsupported)
}

#[cfg(not(target_os = "android"))]
async fn close<R: Runtime>(_app: &AppHandle<R>, _id: u32) {}

/// The platform's HTTP client. Its error text is dropped unread: it may name the address
#[cfg(target_os = "android")]
async fn send<R: Runtime>(
  app: &AppHandle<R>,
  request: NativeRequest,
) -> Result<ApiResponse, Refusal> {
  let native = app.try_state::<NativeHttp<R>>().ok_or(Refusal::Unsupported)?;
  native.0.run_mobile_plugin_async("fetch", request).await.map_err(|_| Refusal::Unreachable)
}

/// iOS gets its client later, built on a Mac (docs/handy.md); `tauri dev` on a desktop has none
#[cfg(not(target_os = "android"))]
async fn send<R: Runtime>(
  _app: &AppHandle<R>,
  _request: NativeRequest,
) -> Result<ApiResponse, Refusal> {
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
