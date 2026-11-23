package app.kennwort.autofill

/**
 * K-802: what the service offers and, after the person's choice, what it fills. The offer holds no
 * value at all: the suggestion Android shows only carries an authentication intent, so nothing
 * reaches the other app before the person tapped it, unlocked Kennwort and picked an entry.
 */
data class Offer<Id>(
  val requestId: String,
  val requestJson: String,
  val fields: List<String>,
  val usernameIds: List<Id>,
  val passwordIds: List<Id>,
)

object FillPlan {
  fun <Id> offer(detected: Detected, target: FillTarget, requestId: String, idOf: (FormNode) -> Id?): Offer<Id>? {
    val usernameIds = detected.usernames.mapNotNull(idOf)
    val passwordIds = detected.passwords.mapNotNull(idOf)
    val fields = listOfNotNull(
      "username".takeIf { usernameIds.isNotEmpty() },
      "password".takeIf { passwordIds.isNotEmpty() },
    )
    if (fields.isEmpty()) return null
    return Offer(requestId, BridgeJson.request(requestId, target, fields), fields, usernameIds, passwordIds)
  }

  /** Each field of the offer with the value the answer gave for its kind; nothing for a cancel */
  fun <Id> values(usernameIds: List<Id>, passwordIds: List<Id>, answer: BridgeJson.Answer): List<Pair<Id, String>> {
    if (answer !is BridgeJson.Answer.Fill) return emptyList()
    val username = answer.values["username"]
    val password = answer.values["password"]
    return usernameIds.mapNotNull { id -> username?.let { id to it } } +
      passwordIds.mapNotNull { id -> password?.let { id to it } }
  }
}
