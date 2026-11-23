package app.kennwort.autofill

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout

/** K-802: a plain login form, as another app on the phone would show it */
class LoginScreenActivity : Activity() {
  lateinit var username: EditText
  lateinit var password: EditText

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    username = EditText(this).apply {
      setAutofillHints(View.AUTOFILL_HINT_USERNAME)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
    }
    password = EditText(this).apply {
      setAutofillHints(View.AUTOFILL_HINT_PASSWORD)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
    }
    setContentView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(username)
      addView(password)
    })
  }
}
