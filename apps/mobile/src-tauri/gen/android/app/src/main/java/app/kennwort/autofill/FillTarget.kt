package app.kennwort.autofill

/** Where to fill, as the bridge names it (packages/client/src/autofill/bridge.ts, FillTarget) */
sealed interface FillTarget {
  data class Web(val host: String) : FillTarget
  data class App(val id: String) : FillTarget
}

/**
 * K-802: whose login a screen asks for. Any app can put a webDomain on its views, so a domain is
 * believed only from a browser that reports the page it shows (Chrome since 135, Firefox, and the
 * compat-mode browsers of autofill_service.xml), and only if the app is signed with that browser's
 * certificate (Signers.kt). Every other app is matched by its own package
 * name, which Android gives the service and the app cannot choose for another app. The exact host
 * match itself runs in the webview (matches.ts), the same function the extension fills by.
 */
object FillTargets {
  /**
   * Browsers whose webDomain names the page they show, with the SHA-256 digests of the certificates
   * they are signed with: an app installed under a browser's package name but signed by anyone else
   * is not that browser. Digests as the privileged-apps lists of Google's Credential Manager carry
   * them (bitwarden/android, app/src/main/assets/fido2_privileged_{google,community}.json at c5b18b5).
   */
  val BROWSERS: Map<String, Set<String>> = mapOf(
    "com.android.chrome" to setOf(
      "19:75:B2:F1:71:77:BC:89:A5:DF:F3:1F:9E:64:A6:CA:E2:81:A5:3D:C1:D1:D5:9B:1D:14:7F:E1:C8:2A:FA:00",
      "F0:FD:6C:5B:41:0F:25:CB:25:C3:B5:33:46:C8:97:2F:AE:30:F8:EE:74:11:DF:91:04:80:AD:6B:2D:60:DB:83",
    ),
    "com.chrome.beta" to setOf(
      "3D:7A:12:23:01:9A:A3:9D:9E:A0:E3:43:6A:B7:C0:89:6B:FB:4F:B6:79:F4:DE:5F:E7:C2:3F:32:6C:8F:99:4A",
      "DA:63:3D:34:B6:9E:63:AE:21:03:B4:9D:53:CE:05:2F:C5:F7:F3:C5:3A:AB:94:FD:C2:A2:08:BD:FD:14:24:9C",
    ),
    "com.chrome.dev" to setOf(
      "3D:7A:12:23:01:9A:A3:9D:9E:A0:E3:43:6A:B7:C0:89:6B:FB:4F:B6:79:F4:DE:5F:E7:C2:3F:32:6C:8F:99:4A",
      "90:44:EE:5F:EE:4B:BC:5E:21:DD:44:66:54:31:C4:EB:1F:1F:71:A3:27:16:A0:BC:92:7B:CB:B3:92:33:CA:BF",
    ),
    "com.chrome.canary" to setOf(
      "20:19:DF:A1:FB:23:EF:BF:70:C5:BC:D1:44:3C:5B:EA:B0:4F:3F:2F:F4:36:6E:9A:C1:E3:45:76:39:A2:4C:FC",
    ),
    "org.mozilla.firefox" to setOf(
      "A7:8B:62:A5:16:5B:44:94:B2:FE:AD:9E:76:A2:80:D2:2D:93:7F:EE:62:51:AE:CE:59:94:46:B2:EA:31:9B:04",
    ),
    "org.mozilla.firefox_beta" to setOf(
      "A7:8B:62:A5:16:5B:44:94:B2:FE:AD:9E:76:A2:80:D2:2D:93:7F:EE:62:51:AE:CE:59:94:46:B2:EA:31:9B:04",
    ),
    "org.mozilla.fenix" to setOf(
      "50:04:77:90:88:E7:F9:88:D5:BC:5C:C5:F8:79:8F:EB:F4:F8:CD:08:4A:1B:2A:46:EF:D4:C8:EE:4A:EA:F2:11",
    ),
    "org.mozilla.focus" to setOf(
      "62:03:A4:73:BE:36:D6:4E:E3:7F:87:FA:50:0E:DB:C7:9E:AB:93:06:10:AB:9B:9F:A4:CA:7D:5C:1F:1B:4F:FC",
    ),
    "com.microsoft.emmx" to setOf(
      "01:E1:99:97:10:A8:2C:27:49:B4:D5:0C:44:5D:C8:5D:67:0B:61:36:08:9D:0A:76:6A:73:82:7C:82:A1:EA:C9",
    ),
    "com.brave.browser" to setOf(
      "9C:2D:B7:05:13:51:5F:DB:FB:BC:58:5B:3E:DF:3D:71:23:D4:DC:67:C9:4F:FD:30:63:61:C1:D7:9B:BF:18:AC",
    ),
    "com.sec.android.app.sbrowser" to setOf(
      "34:DF:0E:7A:9F:1C:F1:89:2E:45:C0:56:B4:97:3C:D8:1C:CF:14:8A:40:50:D1:1A:EA:4A:C5:A6:5F:90:0A:42",
      "C8:A2:E9:BC:CF:59:7C:2F:B6:DC:66:BE:E2:93:FC:13:F2:FC:47:EC:77:BC:6B:2B:0D:52:C1:1F:51:19:2A:B8",
    ),
    "com.vivaldi.browser" to setOf(
      "E8:A7:85:44:65:5B:A8:C0:98:17:F7:32:76:8F:56:89:B1:66:2E:C4:B2:BC:5A:0B:C0:EC:13:8D:33:CA:3D:1E",
    ),
    "com.duckduckgo.mobile.android" to setOf(
      "BB:7B:B3:1C:57:3C:46:A1:DA:7F:C5:C5:28:A6:AC:F4:32:10:84:56:FE:EC:50:81:0C:7F:33:69:4E:B3:D2:D4",
    ),
    "com.opera.browser" to setOf(
      "5D:6A:FB:F8:7F:65:2A:F0:46:47:AD:A0:DF:63:4C:F2:23:70:90:0B:16:4B:09:D5:0B:D2:3A:A2:CB:52:85:B8",
    ),
  )

  /** A certificate's SHA-256 digest as [BROWSERS] writes it: upper-case hex pairs joined by ':' */
  fun digest(certificate: ByteArray): String =
    java.security.MessageDigest.getInstance("SHA-256").digest(certificate).joinToString(":") { "%02X".format(it) }

  // As bridge.ts reads them: a lower-case host, an Android package name
  private val HOST = Regex("^[a-z0-9.-]{1,253}$")
  private val PACKAGE = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")

  /** The host as the bridge takes it, or null: lower case, without a trailing dot */
  fun host(domain: String): String? = domain.trim().lowercase().removeSuffix(".").takeIf { HOST.matches(it) }

  /**
   * The target of a screen, or null for nothing to fill: Kennwort itself, a field in a frame of
   * another document, a page that does not come over https (P-17: a password is never filled into
   * a page served over http; a browser that names no scheme is taken at its domain).
   */
  fun of(
    requester: String,
    own: String,
    detected: Detected,
    signers: Set<String>,
    browsers: Map<String, Set<String>> = BROWSERS,
  ): FillTarget? {
    if (requester == own || detected.isEmpty || detected.mixedDocuments) return null
    val domain = detected.webDomain
    if (domain != null && browsers[requester].orEmpty().any { it in signers }) {
      val scheme = detected.webScheme?.lowercase()
      if (scheme != null && scheme != "https") return null
      return host(domain)?.let { FillTarget.Web(it) }
    }
    return requester.takeIf { PACKAGE.matches(it) && it.length <= 255 }?.let { FillTarget.App(it) }
  }
}
