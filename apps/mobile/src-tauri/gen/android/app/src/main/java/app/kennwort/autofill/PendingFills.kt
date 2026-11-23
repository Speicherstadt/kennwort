package app.kennwort.autofill

/**
 * K-802: the one fill request waiting for the person, in memory only. The authentication activity
 * opens it when the person taps Kennwort's suggestion; the webview reads it (AutofillPlugin.kt)
 * once the account is unlocked and answers it; only an answer for exactly this request reaches the
 * activity, which then fills. A newer request cancels the older one, so a stale answer fills
 * nothing. Nothing here is written to disk or logged.
 */
class PendingFills {
  private class Pending(
    val requestId: String,
    val requestJson: String,
    val fields: List<String>,
    val onAnswer: (BridgeJson.Answer) -> Unit,
  )

  private var current: Pending? = null

  @Synchronized
  fun open(requestId: String, requestJson: String, fields: List<String>, onAnswer: (BridgeJson.Answer) -> Unit) {
    val before = current
    current = Pending(requestId, requestJson, fields, onAnswer)
    before?.onAnswer?.invoke(BridgeJson.Answer.Cancel)
  }

  /** The request's JSON for the webview, without any secret */
  @Synchronized
  fun pendingJson(): String? = current?.requestJson

  /** Hands a valid answer to the waiting activity once; anything else changes nothing */
  fun answer(text: String): Boolean {
    val (pending, parsed) = synchronized(this) {
      val pending = current ?: return false
      val parsed = BridgeJson.answer(text, pending.requestId, pending.fields) ?: return false
      current = null
      pending to parsed
    }
    pending.onAnswer(parsed)
    return true
  }

  /** The activity went away without an answer */
  @Synchronized
  fun drop(requestId: String) {
    if (current?.requestId == requestId) current = null
  }

  companion object {
    val shared = PendingFills()
  }
}

/** K-802: a login the person chose to save in Android's dialog, until the webview takes it once */
class PendingSave {
  private var json: String? = null

  @Synchronized
  fun offer(proposal: String) {
    json = proposal
  }

  @Synchronized
  fun take(): String? = json.also { json = null }

  companion object {
    val shared = PendingSave()
  }
}
