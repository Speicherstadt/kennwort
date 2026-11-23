//! K-803: copying a secret in the app. The shared UI calls the command `copy_secret`
//! (packages/ui/src/lib/copy.ts); on Android it goes to the Kotlin plugin `ClipboardPlugin`, which
//! marks the clip as sensitive and clears it after 30 s if it is still ours. Elsewhere (iOS for
//! now, desktop dev builds) the command fails and the UI copies the web way, which clears too.

use tauri::{
  AppHandle, Runtime,
  plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "android")]
struct NativeClipboard<R: Runtime>(tauri::plugin::PluginHandle<R>);

/// Registers the Android plugin (a class in the app module, gen/android, app.kennwort)
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("kennwort-clipboard")
    .setup(|_app, _api| {
      #[cfg(target_os = "android")]
      {
        use tauri::Manager;
        let handle = _api.register_android_plugin("app.kennwort", "ClipboardPlugin")?;
        _app.manage(NativeClipboard(handle));
      }
      Ok(())
    })
    .build()
}

#[derive(serde::Serialize)]
struct CopyArgs<'a> {
  text: &'a str,
}

/// The text is passed straight on to the system clipboard; it is never logged or kept here
#[tauri::command]
pub fn copy_secret<R: Runtime>(app: AppHandle<R>, text: String) -> Result<(), String> {
  copy_native(&app, CopyArgs { text: &text })
}

#[cfg(target_os = "android")]
fn copy_native<R: Runtime>(app: &AppHandle<R>, args: CopyArgs<'_>) -> Result<(), String> {
  use tauri::Manager;
  let native = app.state::<NativeClipboard<R>>();
  native
    .0
    .run_mobile_plugin::<serde_json::Value>("copy", args)
    .map(|_| ())
    .map_err(|_| "copy failed".into())
}

#[cfg(not(target_os = "android"))]
fn copy_native<R: Runtime>(_app: &AppHandle<R>, _args: CopyArgs<'_>) -> Result<(), String> {
  Err("no native clipboard on this platform".into())
}
