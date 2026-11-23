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
  // The SHA-256 digests of the release signing certificates (bitwarden/android
  // fido2_privileged_google.json at c5b18b5)
  private val chrome = setOf("F0:FD:6C:5B:41:0F:25:CB:25:C3:B5:33:46:C8:97:2F:AE:30:F8:EE:74:11:DF:91:04:80:AD:6B:2D:60:DB:83")
  private val firefox = setOf("A7:8B:62:A5:16:5B:44:94:B2:FE:AD:9E:76:A2:80:D2:2D:93:7F:EE:62:51:AE:CE:59:94:46:B2:EA:31:9B:04")

  @Test
  fun takesTheHostFromABrowser() {
    assertEquals(
      FillTarget.Web("portal.weber-haustechnik.test"),
      FillTargets.of("com.android.chrome", own, detected("Portal.Weber-Haustechnik.test.", "https"), chrome),
    )
    assertEquals(
      FillTarget.Web("portal.weber-haustechnik.test"),
      FillTargets.of("org.mozilla.firefox", own, detected("portal.weber-haustechnik.test"), firefox),
    )
  }

  @Test
  fun neverBelievesADomainFromAnApp() {
    // Any app can claim a webDomain for its views: it gets its own package, never the bank's host
    assertEquals(
      FillTarget.App("com.evil.game"),
      FillTargets.of("com.evil.game", own, detected("bank.test", "https"), chrome),
    )
  }

  @Test
  fun takesTheAppPackage() {
    assertEquals(FillTarget.App("com.heizungsapp.monteur"), FillTargets.of("com.heizungsapp.monteur", own, detected(), emptySet()))
  }

  @Test
  fun fillsNothingForAPageOverHttp() {
    assertNull(FillTargets.of("com.android.chrome", own, detected("portal.weber-haustechnik.test", "http"), chrome))
  }

  @Test
  fun fillsNothingIntoAFrameOfAnotherDocument() {
    assertNull(FillTargets.of("com.android.chrome", own, detected("portal.weber-haustechnik.test", "https", mixed = true), chrome))
    assertNull(FillTargets.of("com.heizungsapp.monteur", own, detected(mixed = true), emptySet()))
  }

  @Test
  fun fillsNothingIntoKennwortItselfOrWithoutFields() {
    assertNull(FillTargets.of(own, own, detected(), emptySet()))
    assertNull(FillTargets.of("com.heizungsapp.monteur", own, Detected(emptyList(), emptyList(), null, null, false), emptySet()))
  }

  @Test
  fun refusesHostsAndPackagesTheBridgeWouldRefuse() {
    assertNull(FillTargets.of("com.android.chrome", own, detected("evil host.test"), chrome))
    assertNull(FillTargets.of("monteur", own, detected(), emptySet()))
  }

  @Test
  fun believesADomainOnlyFromABrowserSignedByItsPublisher() {
    // An app installed under Chrome's package name but signed by someone else is not Chrome
    assertEquals(
      FillTarget.App("com.android.chrome"),
      FillTargets.of("com.android.chrome", own, detected("bank.test", "https"), setOf("00:11:22")),
    )
    assertEquals(
      FillTarget.App("com.android.chrome"),
      FillTargets.of("com.android.chrome", own, detected("bank.test", "https"), firefox),
    )
    assertEquals(
      FillTarget.App("com.android.chrome"),
      FillTargets.of("com.android.chrome", own, detected("bank.test", "https"), emptySet()),
    )
  }

  @Test
  fun writesACertificateDigestAsTheListDoes() {
    assertEquals(
      "BA:78:16:BF:8F:01:CF:EA:41:41:40:DE:5D:AE:22:23:B0:03:61:A3:96:17:7A:9C:B4:10:FF:61:F2:00:15:AD",
      FillTargets.digest("abc".toByteArray()),
    )
  }
}
