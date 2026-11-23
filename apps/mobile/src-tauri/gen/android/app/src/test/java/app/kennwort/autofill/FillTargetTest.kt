package app.kennwort.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// K-802: whose login a screen asks for: a browser's page by its host, every other app by its package
class FillTargetTest {
  private val own = "app.kennwort"
  private val password = FormNode(id = "p", fillable = true, htmlType = "password")
  private fun detected(domain: String? = null, scheme: String? = null, mixed: Boolean = false) =
    Detected(emptyList(), listOf(password), domain, scheme, mixed)

  @Test
  fun takesTheHostFromABrowser() {
    assertEquals(
      FillTarget.Web("portal.weber-haustechnik.test"),
      FillTargets.of("com.android.chrome", own, detected("Portal.Weber-Haustechnik.test.", "https")),
    )
    assertEquals(
      FillTarget.Web("portal.weber-haustechnik.test"),
      FillTargets.of("org.mozilla.firefox", own, detected("portal.weber-haustechnik.test")),
    )
  }

  @Test
  fun neverBelievesADomainFromAnApp() {
    // Any app can claim a webDomain for its views: it gets its own package, never the bank's host
    assertEquals(
      FillTarget.App("com.evil.game"),
      FillTargets.of("com.evil.game", own, detected("bank.test", "https")),
    )
  }

  @Test
  fun takesTheAppPackage() {
    assertEquals(FillTarget.App("com.heizungsapp.monteur"), FillTargets.of("com.heizungsapp.monteur", own, detected()))
  }

  @Test
  fun fillsNothingForAPageOverHttp() {
    assertNull(FillTargets.of("com.android.chrome", own, detected("portal.weber-haustechnik.test", "http")))
  }

  @Test
  fun fillsNothingIntoAFrameOfAnotherDocument() {
    assertNull(FillTargets.of("com.android.chrome", own, detected("portal.weber-haustechnik.test", "https", mixed = true)))
    assertNull(FillTargets.of("com.heizungsapp.monteur", own, detected(mixed = true)))
  }

  @Test
  fun fillsNothingIntoKennwortItselfOrWithoutFields() {
    assertNull(FillTargets.of(own, own, detected()))
    assertNull(FillTargets.of("com.heizungsapp.monteur", own, Detected(emptyList(), emptyList(), null, null, false)))
  }

  @Test
  fun refusesHostsAndPackagesTheBridgeWouldRefuse() {
    assertNull(FillTargets.of("com.android.chrome", own, detected("evil host.test")))
    assertNull(FillTargets.of("monteur", own, detected()))
  }
}
