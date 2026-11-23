package app.kennwort.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// K-802: which fields take a username or a password, and in which document they lie
class FieldDetectionTest {
  private fun field(id: String, block: FormNode.() -> FormNode = { this }) = FormNode(id = id, fillable = true).block()
  private fun ids(nodes: List<FormNode>) = nodes.map { it.id }

  @Test
  fun readsAutofillHints() {
    val detected = detect(listOf(FormNode(id = "root", children = listOf(
      field("u") { copy(hints = listOf("username")) },
      field("p") { copy(hints = listOf("password")) },
    ))))
    assertEquals(listOf("u"), ids(detected.usernames))
    assertEquals(listOf("p"), ids(detected.passwords))
    assertFalse(detected.mixedDocuments)
  }

  @Test
  fun readsInputTypes() {
    val password = TYPE_CLASS_TEXT or TYPE_TEXT_VARIATION_PASSWORD
    val email = TYPE_CLASS_TEXT or TYPE_TEXT_VARIATION_EMAIL_ADDRESS
    assertEquals(FieldKind.PASSWORD, kindOf(field("p") { copy(inputType = password) }))
    assertEquals(FieldKind.PASSWORD, kindOf(field("p") { copy(inputType = TYPE_CLASS_TEXT or TYPE_TEXT_VARIATION_WEB_PASSWORD) }))
    assertEquals(FieldKind.PASSWORD, kindOf(field("pin") { copy(inputType = TYPE_CLASS_NUMBER or TYPE_NUMBER_VARIATION_PASSWORD) }))
    assertEquals(FieldKind.USERNAME, kindOf(field("e") { copy(inputType = email) }))
    assertNull(kindOf(field("t") { copy(inputType = TYPE_CLASS_TEXT) }))
  }

  @Test
  fun readsTheHtmlABrowserReports() {
    assertEquals(FieldKind.PASSWORD, kindOf(field("p") { copy(htmlType = "password") }))
    assertEquals(FieldKind.PASSWORD, kindOf(field("p") { copy(htmlAutocomplete = "section-x current-password") }))
    assertEquals(FieldKind.USERNAME, kindOf(field("u") { copy(htmlAutocomplete = "username") }))
  }

  @Test
  fun neverTakesAOneTimeCodeField() {
    assertNull(kindOf(field("c") { copy(hints = listOf("smsOTPCode"), inputType = TYPE_CLASS_TEXT or TYPE_TEXT_VARIATION_PASSWORD) }))
    assertNull(kindOf(field("c") { copy(htmlAutocomplete = "one-time-code", htmlType = "password") }))
  }

  @Test
  fun skipsHiddenAndUnfillableViews() {
    assertNull(kindOf(field("p") { copy(hints = listOf("password"), visible = false) }))
    assertNull(kindOf(FormNode(id = "label", hints = listOf("password"))))
  }

  @Test
  fun takesTheFieldBeforeAPasswordAsUsernameOnlyNextToOne() {
    val withPassword = detect(listOf(FormNode(id = "root", children = listOf(
      field("search"),
      field("login") { copy(idEntry = "login_name") },
      field("p") { copy(htmlType = "password") },
    ))))
    assertEquals(listOf("login"), ids(withPassword.usernames))
    val withoutPassword = detect(listOf(FormNode(id = "root", children = listOf(field("login") { copy(idEntry = "user") }))))
    assertTrue(withoutPassword.isEmpty)
  }

  @Test
  fun namesTheTopDocument() {
    val page = FormNode(id = "doc", webDomain = "portal.weber-haustechnik.test", webScheme = "https", children = listOf(
      field("u") { copy(htmlAutocomplete = "username") },
      field("p") { copy(htmlType = "password") },
    ))
    val detected = detect(listOf(FormNode(id = "browser", children = listOf(page))))
    assertEquals("portal.weber-haustechnik.test", detected.webDomain)
    assertEquals("https", detected.webScheme)
    assertFalse(detected.mixedDocuments)
  }

  @Test
  fun marksAFieldInAFrameOfAnotherDocument() {
    val frame = FormNode(id = "frame", webDomain = "evil.test", children = listOf(field("p") { copy(htmlType = "password") }))
    val page = FormNode(id = "doc", webDomain = "portal.weber-haustechnik.test", children = listOf(
      field("u") { copy(htmlAutocomplete = "username") },
      frame,
    ))
    assertTrue(detect(listOf(page)).mixedDocuments)
  }

  @Test
  fun acceptsAFrameOfTheSameDocumentHost() {
    val frame = FormNode(id = "frame", webDomain = "portal.weber-haustechnik.test", children = listOf(field("p") { copy(htmlType = "password") }))
    val page = FormNode(id = "doc", webDomain = "portal.weber-haustechnik.test", children = listOf(frame))
    assertFalse(detect(listOf(page)).mixedDocuments)
  }

  @Test
  fun aFrameOfTheSameHostServedOverHttpCountsAsAnotherDocument() {
    // P-17: never fill into a page served over http, also not into an http frame of an https page
    val detected = detect(listOf(FormNode(id = "page", webDomain = "bank.test", webScheme = "https", children = listOf(
      field("u") { copy(hints = listOf("username")) },
      FormNode(id = "frame", webDomain = "bank.test", webScheme = "http", children = listOf(
        field("p") { copy(hints = listOf("password")) },
      )),
    ))))
    assertTrue(detected.mixedDocuments)
  }
}
