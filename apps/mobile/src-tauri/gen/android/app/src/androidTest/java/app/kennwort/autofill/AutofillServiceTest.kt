package app.kennwort.autofill

import android.view.autofill.AutofillManager
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * K-802, emulator end to end (nightly workflow android-emulator.yml, never a merge gate): with
 * Kennwort chosen as the autofill service, another app's login form gets Kennwort's suggestion,
 * and tapping it fills nothing yet: it opens Kennwort to unlock and pick an entry.
 */
@RunWith(AndroidJUnit4::class)
class AutofillServiceTest {
  @get:Rule
  val screen = ActivityScenarioRule(LoginScreenActivity::class.java)

  private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
  private val suggestion = By.text("Fill with Kennwort")

  @Test
  fun offersTheSuggestionAndFillsNothingWithoutUnlocking() {
    screen.scenario.onActivity { activity ->
      val manager = activity.getSystemService(AutofillManager::class.java)
      assertTrue("Kennwort must be the autofill service", manager.hasEnabledAutofillServices())
      activity.password.requestFocus()
      manager.requestAutofill(activity.password)
    }
    val shown = device.wait(Until.findObject(suggestion), 10_000)
    assertNotNull("Kennwort's suggestion is offered", shown)
    shown.click()
    // The tap opens Kennwort (its unlock screen), not a filled form
    assertNotNull(device.wait(Until.hasObject(By.pkg("app.kennwort").depth(0)), 10_000))
    screen.scenario.onActivity { activity ->
      assertEquals("", activity.username.text.toString())
      assertEquals("", activity.password.text.toString())
    }
  }
}
