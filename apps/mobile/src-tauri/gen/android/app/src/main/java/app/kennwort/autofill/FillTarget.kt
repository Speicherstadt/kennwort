package app.kennwort.autofill

/** Where to fill, as the bridge names it (packages/client/src/autofill/bridge.ts, FillTarget) */
sealed interface FillTarget {
  data class Web(val host: String) : FillTarget
  data class App(val id: String) : FillTarget
}

/**
 * K-802: whose login a screen asks for. Any app can put a webDomain on its views, so a domain is
 * believed only from a browser that reports the page it shows (Chrome since 135, Firefox, and the
 * compat-mode browsers of autofill_service.xml). Every other app is matched by its own package
 * name, which Android gives the service and the app cannot choose for another app. The exact host
 * match itself runs in the webview (matches.ts), the same function the extension fills by.
 */
object FillTargets {
  /** Browsers whose webDomain names the page they show; a fake needs the same package name */
  val BROWSERS: Set<String> = setOf(
    "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
    "org.mozilla.firefox", "org.mozilla.firefox_beta", "org.mozilla.fenix", "org.mozilla.focus",
    "com.microsoft.emmx", "com.brave.browser", "com.sec.android.app.sbrowser",
    "com.vivaldi.browser", "com.duckduckgo.mobile.android", "com.opera.browser",
  )

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
  fun of(requester: String, own: String, detected: Detected, browsers: Set<String> = BROWSERS): FillTarget? {
    if (requester == own || detected.isEmpty || detected.mixedDocuments) return null
    val domain = detected.webDomain
    if (domain != null && requester in browsers) {
      val scheme = detected.webScheme?.lowercase()
      if (scheme != null && scheme != "https") return null
      return host(domain)?.let { FillTarget.Web(it) }
    }
    return requester.takeIf { PACKAGE.matches(it) && it.length <= 255 }?.let { FillTarget.App(it) }
  }
}
