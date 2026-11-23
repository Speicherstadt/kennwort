package app.kennwort.autofill

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// K-802: nothing is filled without the person's answer, and only for the request it answers
class FillFlowTest {
  private val user = FormNode(id = "u", fillable = true, hints = listOf("username"))
  private val pass = FormNode(id = "p", fillable = true, hints = listOf("password"))
  private val detected = Detected(listOf(user), listOf(pass), null, null, false)
  private val target = FillTarget.App("com.heizungsapp.monteur")
  private fun offer() = FillPlan.offer(detected, target, "r-1") { it.id as String }!!
  private fun fill(id: String, values: String) = """{"version":1,"requestId":"$id","kind":"fill","values":$values}"""

  @Test
  fun offersTheBridgeRequestWithoutAnyValue() {
    val offer = offer()
    val json = JSONObject(offer.requestJson)
    assertEquals(1, json.getInt("version"))
    assertEquals("r-1", json.getString("requestId"))
    assertEquals("app", json.getJSONObject("target").getString("kind"))
    assertEquals("com.heizungsapp.monteur", json.getJSONObject("target").getString("id"))
    assertEquals(listOf("username", "password"), offer.fields)
    assertEquals(setOf("version", "requestId", "target", "fields"), json.keys().asSequence().toSet()) // keys(): Android's org.json has no keySet()
  }

  @Test
  fun offersNothingWithoutFields() {
    assertNull(FillPlan.offer(Detected(emptyList(), emptyList(), null, null, false), target, "r-1") { it.id })
  }

  @Test
  fun fillsNothingBeforeAnAnswer() {
    val pending = PendingFills()
    var filled: List<Pair<String, String>>? = null
    val offer = offer()
    pending.open(offer.requestId, offer.requestJson, offer.fields) { filled = FillPlan.values(offer.usernameIds, offer.passwordIds, it) }
    assertNull(filled)
    assertEquals(offer.requestJson, pending.pendingJson())
  }

  @Test
  fun fillsTheAnsweredFieldsOnce() {
    val pending = PendingFills()
    var filled: List<Pair<String, String>>? = null
    val offer = offer()
    pending.open(offer.requestId, offer.requestJson, offer.fields) { filled = FillPlan.values(offer.usernameIds, offer.passwordIds, it) }
    assertTrue(pending.answer(fill("r-1", """{"username":"max","password":"M0nteur-App"}""")))
    assertEquals(listOf("u" to "max", "p" to "M0nteur-App"), filled)
    assertNull(pending.pendingJson())
    assertFalse(pending.answer(fill("r-1", """{"password":"again"}""")))
  }

  @Test
  fun ignoresAnAnswerToAnotherRequestOrAnotherVersion() {
    val pending = PendingFills()
    var calls = 0
    pending.open("r-1", "{}", listOf("password")) { calls++ }
    assertFalse(pending.answer(fill("r-2", """{"password":"x"}""")))
    assertFalse(pending.answer("""{"version":2,"requestId":"r-1","kind":"fill","values":{"password":"x"}}"""))
    assertFalse(pending.answer("not json"))
    assertEquals(0, calls)
    assertEquals("{}", pending.pendingJson())
  }

  @Test
  fun keepsOnlyTheRequestedFields() {
    val answer = BridgeJson.answer(fill("r-1", """{"username":"max","password":"pw","totp":"123456"}"""), "r-1", listOf("password"))
    assertEquals(BridgeJson.Answer.Fill(mapOf("password" to "pw")), answer)
    assertEquals(BridgeJson.Answer.Cancel, BridgeJson.answer(fill("r-1", """{"username":"max"}"""), "r-1", listOf("password")))
    assertNull(BridgeJson.answer(fill("r-1", """{"password":"${"x".repeat(4097)}"}"""), "r-1", listOf("password")))
  }

  @Test
  fun fillsNothingOnACancel() {
    val offer = offer()
    assertEquals(emptyList<Pair<String, String>>(), FillPlan.values(offer.usernameIds, offer.passwordIds, BridgeJson.Answer.Cancel))
    val pending = PendingFills()
    var answer: BridgeJson.Answer? = null
    pending.open("r-1", "{}", offer.fields) { answer = it }
    assertTrue(pending.answer("""{"version":1,"requestId":"r-1","kind":"cancel"}"""))
    assertEquals(BridgeJson.Answer.Cancel, answer)
  }

  @Test
  fun aNewerRequestCancelsTheOlderOne() {
    val pending = PendingFills()
    var first: BridgeJson.Answer? = null
    pending.open("r-1", "{}", listOf("password")) { first = it }
    pending.open("r-2", "{\"r\":2}", listOf("password")) {}
    assertEquals(BridgeJson.Answer.Cancel, first)
    assertFalse(pending.answer(fill("r-1", """{"password":"x"}""")))
  }

  @Test
  fun dropsTheRequestWhenTheActivityGoes() {
    val pending = PendingFills()
    pending.open("r-1", "{}", listOf("password")) {}
    pending.drop("r-2")
    assertEquals("{}", pending.pendingJson())
    pending.drop("r-1")
    assertNull(pending.pendingJson())
  }

  @Test
  fun handsASaveOverOnce() {
    val save = PendingSave()
    save.offer(BridgeJson.saveProposal("s-1", target, "max", "pw"))
    val json = JSONObject(save.take()!!)
    assertEquals("pw", json.getString("password"))
    assertNull(save.take())
  }
}
