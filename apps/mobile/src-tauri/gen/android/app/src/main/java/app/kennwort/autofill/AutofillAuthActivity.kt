package app.kennwort.autofill

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import app.kennwort.MainActivity
import app.kennwort.R

/**
 * K-802: started by Android when the person taps Kennwort's suggestion, which is the user action
 * every fill needs. It opens the request (PendingFills.kt) and brings the app forward: the webview
 * lists the entries only once the account is unlocked the normal way (passphrase or passkey, as in
 * the web app; no key is kept on the device for this) and answers with the picked entry's fields.
 * Only then does this activity hand Android a dataset with values, for exactly the fields it
 * offered. Leaving without a choice fills nothing.
 */
class AutofillAuthActivity : Activity() {
  private var requestId: String? = null
  private var answered = false

  override fun onCreate(savedInstanceState: Bundle?) {
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    super.onCreate(savedInstanceState)
    val id = intent.getStringExtra(EXTRA_REQUEST_ID)
    val json = intent.getStringExtra(EXTRA_REQUEST)
    val fields = intent.getStringArrayListExtra(EXTRA_FIELDS)
    val usernames = ids(EXTRA_USERNAME_IDS)
    val passwords = ids(EXTRA_PASSWORD_IDS)
    // Recreated after the process died: the request in memory is gone, so is the answer
    if (id == null || json == null || fields == null || savedInstanceState != null) return finishEmpty()
    requestId = id
    PendingFills.shared.open(id, json, fields) { answer ->
      runOnUiThread { finishWith(FillPlan.values(usernames, passwords, answer)) }
    }
    startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  @Suppress("DEPRECATION")
  private fun ids(name: String): List<AutofillId> =
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableArrayListExtra(name, AutofillId::class.java)
    else intent.getParcelableArrayListExtra<AutofillId>(name)).orEmpty()

  private fun finishWith(values: List<Pair<AutofillId, String>>) {
    answered = true
    if (values.isEmpty()) return finishEmpty()
    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, getString(R.string.autofill_suggestion))
    }
    val dataset = Dataset.Builder(presentation).apply {
      values.forEach { (id, value) ->
        @Suppress("DEPRECATION")
        setValue(id, AutofillValue.forText(value), presentation)
      }
    }.build()
    setResult(RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset))
    finish()
  }

  private fun finishEmpty() {
    setResult(RESULT_CANCELED)
    finish()
  }

  override fun onDestroy() {
    if (!answered) requestId?.let(PendingFills.shared::drop)
    super.onDestroy()
  }

  companion object {
    const val EXTRA_REQUEST_ID = "app.kennwort.autofill.REQUEST_ID"
    const val EXTRA_REQUEST = "app.kennwort.autofill.REQUEST"
    const val EXTRA_FIELDS = "app.kennwort.autofill.FIELDS"
    const val EXTRA_USERNAME_IDS = "app.kennwort.autofill.USERNAME_IDS"
    const val EXTRA_PASSWORD_IDS = "app.kennwort.autofill.PASSWORD_IDS"
  }
}
