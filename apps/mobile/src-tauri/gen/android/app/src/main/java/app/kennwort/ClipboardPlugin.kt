package app.kennwort

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class CopyArgs {
  lateinit var text: String
}

/**
 * K-803: copies a secret for the shared UI (Rust command copy_secret, src-tauri/src/clipboard.rs),
 * marked as sensitive, and clears it after 30 s if the clipboard still holds it. A newer copy
 * replaces the pending clear; the secret is kept in memory only until then.
 */
@TauriPlugin
class ClipboardPlugin(private val activity: Activity) : Plugin(activity) {
  private val main = Handler(Looper.getMainLooper())
  private var pendingClear: Runnable? = null

  @Command
  fun copy(invoke: Invoke) {
    val text = invoke.parseArgs(CopyArgs::class.java).text
    main.post {
      try {
        val clipboard = activity.getSystemService(ClipboardManager::class.java)
        val clip = ClipData.newPlainText(ClipboardGuard.LABEL, text)
        clip.description.extras = PersistableBundle().apply {
          putBoolean(ClipboardGuard.EXTRA_IS_SENSITIVE, true)
        }
        clipboard.setPrimaryClip(clip)
        scheduleClear(clipboard, text)
        invoke.resolve()
      } catch (e: Exception) {
        invoke.reject("copy failed")
      }
    }
  }

  private fun scheduleClear(clipboard: ClipboardManager, text: String) {
    pendingClear?.let(main::removeCallbacks)
    val clear = Runnable {
      pendingClear = null
      // Android 10+ lets only the focused app read the clipboard: in the background the clip reads
      // as null and stays; Android 13+ clears it by itself later, and it is marked sensitive
      val current = clipboard.primaryClip
      val label = current?.description?.label
      val itemText = current?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.text
      if (ClipboardGuard.shouldClear(text, label, itemText)) clearClip(clipboard)
    }
    pendingClear = clear
    main.postDelayed(clear, ClipboardGuard.CLEAR_AFTER_MS)
  }

  private fun clearClip(clipboard: ClipboardManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) clipboard.clearPrimaryClip()
    else clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
  }
}
