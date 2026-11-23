package app.kennwort.autofill

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * K-802: the Kotlin side of the bridge's JSON, version 1 (packages/client/src/autofill/bridge.ts).
 * A request carries no secret. An answer is checked here once more, whatever the webview parsed:
 * it must answer the pending request, and only the fields that request asked for are kept.
 */
object BridgeJson {
  const val VERSION = 1
  private const val MAX_VALUE = 4096

  private fun target(target: FillTarget): JSONObject = when (target) {
    is FillTarget.Web -> JSONObject().put("kind", "web").put("host", target.host)
    is FillTarget.App -> JSONObject().put("kind", "app").put("id", target.id)
  }

  fun request(requestId: String, target: FillTarget, fields: List<String>): String =
    JSONObject()
      .put("version", VERSION)
      .put("requestId", requestId)
      .put("target", target(target))
      .put("fields", JSONArray(fields))
      .toString()

  fun saveProposal(requestId: String, target: FillTarget, username: String, password: String): String =
    JSONObject()
      .put("version", VERSION)
      .put("requestId", requestId)
      .put("target", target(target))
      .put("username", username)
      .put("password", password)
      .toString()

  sealed interface Answer {
    data class Fill(val values: Map<String, String>) : Answer
    data object Cancel : Answer
  }

  /** The answer to the request with this id and these fields, or null for anything else */
  fun answer(text: String, requestId: String, fields: List<String>): Answer? = try {
    val json = JSONObject(text)
    when {
      json.optInt("version", -1) != VERSION -> null
      json.optString("requestId") != requestId -> null
      json.optString("kind") == "cancel" -> Answer.Cancel
      json.optString("kind") == "fill" -> fillValues(json.optJSONObject("values"), fields)
      else -> null
    }
  } catch (e: JSONException) {
    null
  }

  private fun fillValues(values: JSONObject?, fields: List<String>): Answer? {
    if (values == null) return null
    val kept = fields.mapNotNull { field ->
      val value = values.opt(field) as? String ?: return@mapNotNull null
      if (value.length > MAX_VALUE) return null
      field to value
    }.toMap()
    return if (kept.isEmpty()) Answer.Cancel else Answer.Fill(kept)
  }
}
