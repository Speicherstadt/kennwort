package app.kennwort

// The app's HTTP client for its one server (docs/plan.md, Entscheidungen, "Server der App"). Only
// the Rust side calls it (src-tauri/src/commands.rs), after it built the address on the stored
// origin and checked method, headers and body (bridge.rs, server.rs); the plugin has no permission
// in the capabilities, so the webview cannot reach it directly. Android's own TLS and trust store,
// no redirect followed, nothing logged: requests and answers carry session tokens and ciphertexts,
// and an exception's text could name the address, so a failure goes back as one fixed word.
// `stream` opens one of the two live streams (K-708) that Rust checked (live.rs): the same address
// rules, no redirect, events read with a cap (live/SseReader.kt) and handed to Rust's channel, which
// checks each one again; `close` ends it at the lock or the logout.

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.kennwort.live.SseReader
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
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

@InvokeArg
class StreamArgs {
  var id: Int = 0
  lateinit var url: String
  var headers: Array<HeaderArg> = arrayOf()
  lateinit var channel: Channel
}

@InvokeArg
class CloseArgs {
  var id: Int = 0
}

// The notifications and at most a few vaults; more is a webview that forgot to close
private const val MAX_STREAMS = 8

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

/** Connects a live stream; returns it only when the server answered 200 with an event stream */
private fun connect(args: StreamArgs): HttpURLConnection {
  val url = URL(args.url)
  check(allowed(url))
  val connection = url.openConnection() as HttpURLConnection
  try {
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.connectTimeout = 15_000
    // The server pings every 20 s; a silent minute is a dead connection
    connection.readTimeout = 60_000
    connection.requestMethod = "GET"
    args.headers.forEach { connection.setRequestProperty(it.name, it.value) }
    check(connection.responseCode == 200)
    check(connection.url.toString() == url.toString())
    check(connection.contentType?.startsWith("text/event-stream") == true)
    return connection
  } catch (failure: Exception) {
    connection.disconnect()
    throw failure
  }
}

private fun event(name: String, data: String) =
  JSObject().apply {
    put("event", name)
    put("data", data)
  }

private fun end() = JSObject().apply { put("end", "closed") }

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

  private val streams = ConcurrentHashMap<Int, HttpURLConnection>()

  @Command
  fun stream(invoke: Invoke) {
    val args = invoke.parseArgs(StreamArgs::class.java)
    // Each stream holds its thread for as long as it is open
    Thread {
      val connection = runCatching { connect(args) }.getOrNull()
      if (connection == null || streams.size >= MAX_STREAMS) {
        connection?.disconnect()
        invoke.reject("unreachable")
        return@Thread
      }
      streams[args.id] = connection
      invoke.resolve()
      runCatching {
        connection.inputStream.use { input ->
          SseReader.read(input, { !streams.containsKey(args.id) }) {
            args.channel.send(event(it.event, it.data))
          }
        }
      }
      streams.remove(args.id)
      connection.disconnect()
      args.channel.send(end())
    }.start()
  }

  @Command
  fun close(invoke: Invoke) {
    val args = invoke.parseArgs(CloseArgs::class.java)
    // Disconnecting from another thread ends the blocked read at once
    streams.remove(args.id)?.disconnect()
    invoke.resolve()
  }
}
