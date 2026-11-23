package app.kennwort.autofill

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import app.kennwort.MainActivity
import app.kennwort.R
import java.util.UUID

/**
 * K-802: Kennwort's Android autofill service (docs/sicherheitsdesign.md, P-17 "In der App unter
 * Android"). It finds the username and password fields, names the target (the app's package, or
 * the page's host in a browser) and offers one suggestion that carries only an authentication
 * intent: no value leaves Kennwort until the person taps it, unlocks the app the normal way and
 * picks an entry stored for exactly that target (AutofillAuthActivity.kt). Saving opens the app's
 * editor, where the person confirms once more.
 */
class KennwortAutofillService : AutofillService() {
  override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
    val context = request.fillContexts.lastOrNull() ?: return callback.onSuccess(null)
    val structure = context.structure
    val detected = detect(StructureReader.read(structure))
    val requester = structure.activityComponent.packageName
    val target = FillTargets.of(requester, packageName, detected, Signers.of(packageManager, requester))
      ?: return callback.onSuccess(null)
    val offer = FillPlan.offer(detected, target, UUID.randomUUID().toString()) { it.id as? AutofillId }
      ?: return callback.onSuccess(null)
    callback.onSuccess(response(offer))
  }

  private fun response(offer: Offer<AutofillId>): FillResponse {
    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, getString(R.string.autofill_suggestion))
    }
    val auth = Intent(this, AutofillAuthActivity::class.java)
      .putExtra(AutofillAuthActivity.EXTRA_REQUEST_ID, offer.requestId)
      .putExtra(AutofillAuthActivity.EXTRA_REQUEST, offer.requestJson)
      .putStringArrayListExtra(AutofillAuthActivity.EXTRA_FIELDS, ArrayList(offer.fields))
      .putParcelableArrayListExtra(AutofillAuthActivity.EXTRA_USERNAME_IDS, ArrayList(offer.usernameIds))
      .putParcelableArrayListExtra(AutofillAuthActivity.EXTRA_PASSWORD_IDS, ArrayList(offer.passwordIds))
    // Mutable: the system adds the AssistStructure to the intent when it starts the activity
    val flags = PendingIntent.FLAG_CANCEL_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    val sender = PendingIntent.getActivity(this, offer.requestId.hashCode(), auth, flags).intentSender
    val dataset = Dataset.Builder(presentation).apply {
      // No value, only the authentication: the system fills nothing until the activity answers
      (offer.usernameIds + offer.passwordIds).forEach {
        @Suppress("DEPRECATION")
        setValue(it, null, presentation)
      }
      setAuthentication(sender)
    }.build()
    val save = SaveInfo.Builder(saveType(offer), (offer.passwordIds.ifEmpty { offer.usernameIds }).toTypedArray())
      .apply { if (offer.passwordIds.isNotEmpty() && offer.usernameIds.isNotEmpty()) setOptionalIds(offer.usernameIds.toTypedArray()) }
      .build()
    return FillResponse.Builder().addDataset(dataset).setSaveInfo(save).build()
  }

  private fun saveType(offer: Offer<AutofillId>) =
    (if (offer.passwordIds.isNotEmpty()) SaveInfo.SAVE_DATA_TYPE_PASSWORD else 0) or
      (if (offer.usernameIds.isNotEmpty()) SaveInfo.SAVE_DATA_TYPE_USERNAME else 0)

  /**
   * Called only after the person tapped "Save" in Android's own dialog. The login is held in
   * memory and the app opens on its editor, filled in; it is saved only from there.
   */
  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    val structure = request.fillContexts.lastOrNull()?.structure ?: return callback.onSuccess()
    val detected = detect(StructureReader.read(structure, withText = true))
    val requester = structure.activityComponent.packageName
    val target = FillTargets.of(requester, packageName, detected, Signers.of(packageManager, requester))
    val password = detected.passwords.firstNotNullOfOrNull { it.text?.takeIf(String::isNotEmpty) }
    if (target == null || password == null) return callback.onSuccess()
    val username = detected.usernames.firstNotNullOfOrNull { it.text }.orEmpty()
    PendingSave.shared.offer(BridgeJson.saveProposal(UUID.randomUUID().toString(), target, username, password))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val open = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val sender = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT).intentSender
      callback.onSuccess(sender)
    } else {
      // Before Android 9 the app cannot be opened from here; the editor opens at its next start
      callback.onSuccess()
    }
  }
}
