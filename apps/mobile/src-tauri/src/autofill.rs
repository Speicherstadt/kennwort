//! K-802: the webview's three commands for the Android autofill (docs/plan.md, Entscheidungen,
//! "Autofill unter Android"). The Kotlin service keeps what the system asked for in memory
//! (AutofillPlugin.kt, PendingFills.kt); these commands only pass the bridge's JSON between it and
//! the webview (packages/client/src/autofill/bridge.ts), which parses everything it gets. Kotlin
//! checks every answer once more against the pending request before anything is filled. Nothing
//! here logs or keeps a value: an answer carries a password.

use serde::Serialize;

/// The most a bridge message may carry: two fields of at most 4096 characters and the frame
pub const MAX_MESSAGE: usize = 64 * 1024;

/// A message the webview sends to Kotlin, if it is not too large to be a bridge message
pub fn checked_message(text: String) -> Option<String> {
  (text.len() <= MAX_MESSAGE).then_some(text)
}

#[derive(Serialize)]
pub struct RespondArgs {
  pub response: String,
}

#[cfg(feature = "shell")]
pub use shell::*;

#[cfg(feature = "shell")]
mod shell {
  use tauri::{
    AppHandle, Runtime,
    plugin::{Builder, TauriPlugin},
  };

  use super::{RespondArgs, checked_message};

  #[cfg(target_os = "android")]
  struct NativeAutofill<R: Runtime>(tauri::plugin::PluginHandle<R>);

  /// Registers the Kotlin plugin; it has no commands of its own the webview could call directly
  pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("kennwort-autofill")
      .setup(|_app, _api| {
        #[cfg(target_os = "android")]
        {
          use tauri::Manager;
          let handle = _api.register_android_plugin("app.kennwort", "AutofillPlugin")?;
          _app.manage(NativeAutofill(handle));
        }
        Ok(())
      })
      .build()
  }

  /// What the Kotlin plugin resolves with: the bridge's JSON text, or null
  #[derive(serde::Deserialize)]
  #[cfg_attr(not(target_os = "android"), allow(dead_code))]
  struct Message {
    message: Option<String>,
  }

  #[cfg(target_os = "android")]
  fn call<R: Runtime, A: serde::Serialize>(
    app: &AppHandle<R>,
    command: &str,
    args: A,
  ) -> Result<Option<String>, &'static str> {
    use tauri::Manager;
    let native = app.try_state::<NativeAutofill<R>>().ok_or("unsupported")?;
    native
      .0
      .run_mobile_plugin::<Message>(command, args)
      .map(|answer| answer.message)
      .map_err(|_| "autofill failed")
  }

  #[cfg(not(target_os = "android"))]
  fn call<R: Runtime, A: serde::Serialize>(
    _app: &AppHandle<R>,
    _command: &str,
    _args: A,
  ) -> Result<Option<String>, &'static str> {
    Err("unsupported")
  }

  /// The fill request the service waits on, as the bridge's JSON, or nothing
  #[tauri::command]
  pub fn autofill_pending<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, &'static str> {
    call(&app, "pending", ())
  }

  /// The answer to the pending request: Kotlin fills only what matches it
  #[tauri::command]
  pub fn autofill_respond<R: Runtime>(app: AppHandle<R>, response: String) -> Result<(), &'static str> {
    let response = checked_message(response).ok_or("too large")?;
    call(&app, "respond", RespondArgs { response }).map(|_| ())
  }

  /// A login the person chose to save in Android's dialog, handed over once
  #[tauri::command]
  pub fn autofill_take_save<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, &'static str> {
    call(&app, "takeSave", ())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn passes_on_a_bridge_message_up_to_its_cap() {
    assert_eq!(checked_message("{}".into()), Some("{}".into()));
    assert!(checked_message("a".repeat(MAX_MESSAGE)).is_some());
    assert_eq!(checked_message("a".repeat(MAX_MESSAGE + 1)), None);
  }
}
