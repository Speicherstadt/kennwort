package app.kennwort.autofill

/**
 * K-802: which fields of a screen take a username or a password. Pure, without Android types, so
 * the JVM tests cover it: StructureReader.kt turns the system's AssistStructure into [FormNode]s.
 * The signals, strongest first, follow the Android autofill docs ("Optimize your app for
 * autofill"): the autofill hints, the HTML attributes a browser reports (autocomplete, type), the
 * input type, and only then the resource id or hint text, and those only next to a password field.
 */
data class FormNode(
  /** The node's AutofillId on a device; any token in the tests */
  val id: Any?,
  val hints: List<String> = emptyList(),
  val inputType: Int = 0,
  val htmlType: String? = null,
  val htmlAutocomplete: String? = null,
  val idEntry: String? = null,
  val hint: String? = null,
  /** The document's domain, set on the node where a web document starts (ViewNode.webDomain) */
  val webDomain: String? = null,
  val webScheme: String? = null,
  /** A text field the system can fill (AUTOFILL_TYPE_TEXT) */
  val fillable: Boolean = false,
  val visible: Boolean = true,
  /** What the field holds, read only for saving */
  val text: String? = null,
  val children: List<FormNode> = emptyList(),
)

enum class FieldKind { USERNAME, PASSWORD }

/** A field found to fill, with the document it belongs to */
data class FoundField(val node: FormNode, val kind: FieldKind, val domain: String?, val scheme: String?)

data class Detected(
  val usernames: List<FormNode>,
  val passwords: List<FormNode>,
  /** The domain of the top document, if the screen is a web page */
  val webDomain: String?,
  val webScheme: String?,
  /** A field lies in another document than the top one (a cross-origin frame): fill nothing */
  val mixedDocuments: Boolean,
) {
  val isEmpty: Boolean get() = usernames.isEmpty() && passwords.isEmpty()
}

// android.text.InputType, copied as constants so the logic runs without the SDK
internal const val TYPE_MASK_CLASS = 0x0f
internal const val TYPE_MASK_VARIATION = 0xff0
internal const val TYPE_CLASS_TEXT = 0x01
internal const val TYPE_CLASS_NUMBER = 0x02
internal const val TYPE_TEXT_VARIATION_EMAIL_ADDRESS = 0x20
internal const val TYPE_TEXT_VARIATION_PASSWORD = 0x80
internal const val TYPE_TEXT_VARIATION_VISIBLE_PASSWORD = 0x90
internal const val TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS = 0xd0
internal const val TYPE_TEXT_VARIATION_WEB_PASSWORD = 0xe0
internal const val TYPE_NUMBER_VARIATION_PASSWORD = 0x10

private val PASSWORD_HINTS = setOf("password", "newpassword", "current-password", "new-password")
private val USERNAME_HINTS = setOf("username", "emailaddress", "email", "newusername")
// One-time codes are never filled from the vault (K-802)
private val OTHER_HINTS = setOf("smsotpcode", "one-time-code", "2faappotpcode", "otp")
private val USERNAME_WORDS = listOf("user", "login", "email", "e-mail", "mail", "benutzer", "anmelde", "konto", "account")

private fun lower(values: List<String?>) = values.mapNotNull { it?.lowercase()?.trim() }

private fun byHints(node: FormNode): FieldKind? {
  val hints = lower(node.hints + node.htmlAutocomplete?.split(' ').orEmpty())
  return when {
    hints.any { it in OTHER_HINTS } -> null
    hints.any { it in PASSWORD_HINTS } -> FieldKind.PASSWORD
    hints.any { it in USERNAME_HINTS } -> FieldKind.USERNAME
    else -> null
  }
}

private fun byType(node: FormNode): FieldKind? {
  when (node.htmlType?.lowercase()) {
    "password" -> return FieldKind.PASSWORD
    "email" -> return FieldKind.USERNAME
  }
  val cls = node.inputType and TYPE_MASK_CLASS
  val variation = node.inputType and TYPE_MASK_VARIATION
  return when {
    cls == TYPE_CLASS_TEXT && variation in setOf(
      TYPE_TEXT_VARIATION_PASSWORD, TYPE_TEXT_VARIATION_VISIBLE_PASSWORD, TYPE_TEXT_VARIATION_WEB_PASSWORD,
    ) -> FieldKind.PASSWORD
    cls == TYPE_CLASS_NUMBER && variation == TYPE_NUMBER_VARIATION_PASSWORD -> FieldKind.PASSWORD
    cls == TYPE_CLASS_TEXT && variation in setOf(
      TYPE_TEXT_VARIATION_EMAIL_ADDRESS, TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS,
    ) -> FieldKind.USERNAME
    else -> null
  }
}

private fun hasOtherHint(node: FormNode) =
  lower(node.hints + node.htmlAutocomplete?.split(' ').orEmpty()).any { it in OTHER_HINTS }

/** What a field is by its strong signals, or null */
fun kindOf(node: FormNode): FieldKind? =
  if (!node.fillable || !node.visible) null else byHints(node) ?: if (hasOtherHint(node)) null else byType(node)

private fun looksLikeUsername(node: FormNode): Boolean {
  if (!node.fillable || !node.visible || hasOtherHint(node)) return false
  val words = lower(listOf(node.idEntry, node.hint))
  return words.any { text -> USERNAME_WORDS.any { it in text } }
}

private data class Walked(val node: FormNode, val domain: String?, val scheme: String?)

/** Every node in document order, with the web document it lies in (the nearest webDomain) */
private fun walk(node: FormNode, domain: String?, scheme: String?, out: MutableList<Walked>) {
  val here = node.webDomain?.takeIf { it.isNotBlank() }
  val ownDomain = here ?: domain
  val ownScheme = if (here != null) node.webScheme else scheme
  out += Walked(node, ownDomain, ownScheme)
  node.children.forEach { walk(it, ownDomain, ownScheme, out) }
}

/** The username and password fields of a screen, and whether they all lie in its top document */
fun detect(roots: List<FormNode>): Detected {
  val all = mutableListOf<Walked>()
  roots.forEach { walk(it, null, null, all) }
  val top = all.firstOrNull { it.domain != null }
  val strong = all.mapNotNull { w -> kindOf(w.node)?.let { FoundField(w.node, it, w.domain, w.scheme) } }
  val passwords = strong.filter { it.kind == FieldKind.PASSWORD }
  val strongUsers = strong.filter { it.kind == FieldKind.USERNAME }
  // A weak signal counts only next to a password field: the id or hint, else the text field just
  // before the first password field, as most login forms have it
  val users = strongUsers.ifEmpty {
    if (passwords.isEmpty()) emptyList()
    else {
      val firstPassword = all.indexOfFirst { it.node === passwords.first().node }
      val before = all.subList(0, firstPassword).filter { it.node.fillable && it.node.visible && !hasOtherHint(it.node) && kindOf(it.node) == null }
      val named = before.lastOrNull { looksLikeUsername(it.node) } ?: before.lastOrNull()
      listOfNotNull(named?.let { FoundField(it.node, FieldKind.USERNAME, it.domain, it.scheme) })
    }
  }
  val found = users + passwords
  // A document is its domain and its scheme: an http frame of an https page is another one (P-17)
  val mixed = found.any { it.domain != top?.domain || it.scheme != top?.scheme }
  return Detected(
    usernames = users.map { it.node },
    passwords = passwords.map { it.node },
    webDomain = top?.domain,
    webScheme = top?.scheme,
    mixedDocuments = mixed,
  )
}
