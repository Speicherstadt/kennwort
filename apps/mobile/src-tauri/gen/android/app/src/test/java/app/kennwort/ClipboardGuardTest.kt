package app.kennwort

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClipboardGuardTest {
  @Test
  fun clearsOurOwnClip() {
    assertTrue(ClipboardGuard.shouldClear("geheim", ClipboardGuard.LABEL, "geheim"))
  }

  @Test
  fun leavesALaterCopyAlone() {
    assertFalse(ClipboardGuard.shouldClear("geheim", ClipboardGuard.LABEL, "anderes"))
    assertFalse(ClipboardGuard.shouldClear("geheim", "Notizen", "geheim"))
  }

  @Test
  fun neverClearsBlindWhenUnreadable() {
    assertFalse(ClipboardGuard.shouldClear("geheim", null, null))
  }

  @Test
  fun waitsThirtySecondsAndUsesTheDocumentedExtra() {
    assertEquals(30_000L, ClipboardGuard.CLEAR_AFTER_MS)
    assertEquals("android.content.extra.IS_SENSITIVE", ClipboardGuard.EXTRA_IS_SENSITIVE)
  }
}
