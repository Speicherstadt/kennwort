package app.kennwort.live

// Reads a server-sent event stream (HTML Living Standard, "Parsing an event stream") for the app's
// live streams (K-708; ServerPlugin.kt, src-tauri/src/live.rs). Pure Kotlin on an InputStream, no
// Android API, so the JVM tests run it as is. Lines are read byte by byte with a cap: a server that
// never ends a line cannot fill the memory. Only `event` and `data` matter; `id`, `retry` and
// comments are skipped, since the app reconnects on its own and pulls anew on "ready".

import java.io.ByteArrayOutputStream
import java.io.InputStream

data class SseEvent(val event: String, val data: String)

class SseTooLarge : Exception()

object SseReader {
  // As MAX_EVENT in live.rs, plus room for the field names; Rust checks the exact size again
  const val MAX_LINE = 4 * 1024 + 16
  const val MAX_EVENT = 4 * 1024

  /** One line without its end (CRLF, LF or CR), or null at the end of the stream */
  fun readLine(input: InputStream, pending: IntArray): String? {
    val out = ByteArrayOutputStream()
    while (true) {
      val byte = if (pending[0] >= 0) pending[0].also { pending[0] = -1 } else input.read()
      when {
        byte < 0 -> return if (out.size() == 0) null else out.toString(Charsets.UTF_8.name())
        byte == '\n'.code -> return out.toString(Charsets.UTF_8.name())
        byte == '\r'.code -> {
          val next = input.read()
          if (next != '\n'.code) pending[0] = next
          return out.toString(Charsets.UTF_8.name())
        }
        out.size() >= MAX_LINE -> throw SseTooLarge()
        else -> out.write(byte)
      }
    }
  }

  /** The state of the event being read: its name and its data lines so far */
  data class Partial(val event: String = "", val data: List<String> = emptyList(), val size: Int = 0)

  /** One line applied to the partial event; a blank line hands out the event (if it has data) */
  fun feed(partial: Partial, line: String): Pair<Partial, SseEvent?> {
    if (line.isEmpty()) {
      val done = if (partial.data.isEmpty()) null
        else SseEvent(partial.event.ifEmpty { "message" }, partial.data.joinToString("\n"))
      return Partial() to done
    }
    if (line.startsWith(":")) return partial to null
    val colon = line.indexOf(':')
    val field = if (colon < 0) line else line.substring(0, colon)
    val raw = if (colon < 0) "" else line.substring(colon + 1)
    val value = if (raw.startsWith(" ")) raw.substring(1) else raw
    val next = when (field) {
      "event" -> partial.copy(event = value, size = partial.size - partial.event.length + value.length)
      "data" -> partial.copy(data = partial.data + value, size = partial.size + value.length + 1)
      else -> partial
    }
    if (next.size > MAX_EVENT) throw SseTooLarge()
    return next to null
  }

  /** Reads events until the stream ends; `stopped` is asked before each line */
  fun read(input: InputStream, stopped: () -> Boolean, onEvent: (SseEvent) -> Unit) {
    val pending = intArrayOf(-1)
    var partial = Partial()
    while (!stopped()) {
      val line = readLine(input, pending) ?: return
      val (next, event) = feed(partial, line)
      partial = next
      if (event != null) onEvent(event)
    }
  }
}
