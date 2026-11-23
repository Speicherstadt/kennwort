package app.kennwort

import android.app.Activity
import app.kennwort.autofill.PendingFills
import app.kennwort.autofill.PendingSave
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class RespondArgs {
  lateinit var response: String
}

/**
 * K-802: the webview's side of the autofill service (Rust commands in src-tauri/src/autofill.rs).
 * `pending` hands over the request waiting in memory, `respond` the person's answer, which
 * PendingFills checks against that request before anything is filled; after an answer the app
 * steps back so the other app is in front again. `takeSave` hands over a login to save, once.
 */
@TauriPlugin
class AutofillPlugin(private val activity: Activity) : Plugin(activity) {
  private fun message(text: String?) = JSObject().apply { put("message", text ?: JSONObject.NULL) }

  @Command
  fun pending(invoke: Invoke) {
    invoke.resolve(message(PendingFills.shared.pendingJson()))
  }

  @Command
  fun respond(invoke: Invoke) {
    val response = invoke.parseArgs(RespondArgs::class.java).response
    if (!PendingFills.shared.answer(response)) return invoke.reject("no such request")
    invoke.resolve(message(null))
    activity.runOnUiThread { activity.moveTaskToBack(true) }
  }

  @Command
  fun takeSave(invoke: Invoke) {
    invoke.resolve(message(PendingSave.shared.take()))
  }
}
