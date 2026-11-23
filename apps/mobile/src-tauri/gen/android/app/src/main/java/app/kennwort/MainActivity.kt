package app.kennwort

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // K-803: no screenshots or screen recordings of the vault, and a blank preview in recents
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
