package app.kennwort

// The app's HTTP client for its one server (docs/plan.md, Entscheidungen, "Server der App"). Only
// the Rust side calls it (src-tauri/src/commands.rs), after it built the address on the stored
// origin and checked method, headers and body (bridge.rs, server.rs); the plugin has no permission
// in the capabilities, so the webview cannot reach it directly. Android's own TLS and trust store,
// no redirect followed, nothing logged: requests and answers carry session tokens and ciphertexts,
// and an exception's text could name the address, so a failure goes back as one fixed word.

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

@InvokeArg
class HeaderArg {
  lateinit var name: String
  lateinit var value: String
}

@InvokeArg
class FetchArgs {
  lateinit var url: String
  lateinit var method: String
  var headers: Array<HeaderArg> = arrayOf()
  var body: String? = null
}

private val LOCAL = setOf("localhost", "127.0.0.1", "[::1]")
// The same cap as MAX_BODY in server.rs, for answers
private const val MAX_ANSWER = 32 * 1024 * 1024

private fun allowed(url: URL) =
  url.protocol == "https" || (url.protocol == "http" && url.host in LOCAL)

private fun readCapped(stream: InputStream?): String {
  if (stream == null) return ""
  val out = ByteArrayOutputStream()
  val buffer = ByteArray(16 * 1024)
  stream.use {
    while (true) {
      val read = it.read(buffer)
      if (read < 0) break
      if (out.size() + read > MAX_ANSWER) throw IllegalStateException("too large")
      out.write(buffer, 0, read)
    }
  }
  return out.toString(Charsets.UTF_8.name())
}

private fun send(args: FetchArgs): JSObject {
  val url = URL(args.url)
  check(allowed(url))
  val connection = url.openConnection() as HttpURLConnection
  try {
    // A redirect would take the body on to an address nobody checked (server-fetch.ts)
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.connectTimeout = 15_000
    connection.readTimeout = 60_000
    connection.requestMethod = args.method
    args.headers.forEach { connection.setRequestProperty(it.name, it.value) }
    args.body?.let { body ->
      connection.doOutput = true
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    }
    val status = connection.responseCode
    check(status in 200..599 && status !in 300..399)
    // Still the address that was asked for: no redirect slipped through
    check(connection.url.toString() == url.toString())
    val stream = if (status >= 400) connection.errorStream else connection.inputStream
    return JSObject().apply {
      put("status", status)
      put("contentType", connection.contentType)
      put("body", readCapped(stream))
    }
  } finally {
    connection.disconnect()
  }
}

@TauriPlugin
class ServerPlugin(activity: Activity) : Plugin(activity) {
  // Network calls may not run on the main thread; a few at once, as a browser would
  private val pool = Executors.newFixedThreadPool(4)

  @Command
  fun fetch(invoke: Invoke) {
    val args = invoke.parseArgs(FetchArgs::class.java)
    pool.execute {
      val answer = runCatching { send(args) }.getOrNull()
      if (answer != null) invoke.resolve(answer) else invoke.reject("unreachable")
    }
  }
}
