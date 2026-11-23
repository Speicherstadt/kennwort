package app.kennwort

/**
 * K-803: the rules of a copied secret, kept free of Android types so the JVM unit tests check them.
 * The same 30 s as the web (packages/ui/src/lib/copy.ts, CLEAR_AFTER_MS).
 */
object ClipboardGuard {
  const val CLEAR_AFTER_MS = 30_000L

  /** The label of our clips; together with the text it tells our copy from someone else's */
  const val LABEL = "Kennwort"

  /**
   * ClipDescription.EXTRA_IS_SENSITIVE (API 33) by its value, so the extra can be set on every
   * version: Android 13+ then shows no preview of the clip, older versions ignore it
   * (developer.android.com/develop/ui/views/touch-and-input/copy-paste#SensitiveContent).
   */
  const val EXTRA_IS_SENSITIVE = "android.content.extra.IS_SENSITIVE"

  /** Clear only if the clipboard still holds our clip; null means it is empty or unreadable */
  fun shouldClear(copied: String, currentLabel: CharSequence?, currentText: CharSequence?): Boolean =
    currentLabel?.toString() == LABEL && currentText?.toString() == copied
}
