package app.kennwort.live

import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SseReaderTest {
  private fun events(text: String): List<SseEvent> {
    val out = mutableListOf<SseEvent>()
    SseReader.read(ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)), { false }) { out.add(it) }
    return out
  }

  @Test
  fun readsTheEventsTheServerSends() {
    val text = "event: ready\ndata: \n\n" +
      "event: record\ndata: {\"entryId\":\"abc\",\"version\":3}\n\n" +
      "event: ping\ndata: \n\n"
    assertEquals(
      listOf(
        SseEvent("ready", ""),
        SseEvent("record", "{\"entryId\":\"abc\",\"version\":3}"),
        SseEvent("ping", ""),
      ),
      events(text),
    )
  }

  @Test
  fun acceptsEveryLineEnd() {
    assertEquals(
      listOf(SseEvent("notification", ""), SseEvent("ready", "")),
      events("event: notification\r\ndata:\r\n\r\nevent:ready\rdata:\r\r"),
    )
  }

  @Test
  fun skipsCommentsIdsAndEventsWithoutData() {
    assertEquals(
      listOf(SseEvent("message", "a\nb")),
      events(": hello\nid: 4\nretry: 10\nevent: lonely\n\ndata: a\ndata: b\n\n"),
    )
  }

  @Test
  fun dropsAnEventCutOffByTheEnd() {
    assertEquals(emptyList<SseEvent>(), events("event: record\ndata: {\"entryId\""))
  }

  @Test
  fun refusesALineThatNeverEnds() {
    try {
      events("data: " + "a".repeat(SseReader.MAX_LINE) + "\n\n")
      fail("no cap")
    } catch (expected: SseTooLarge) {
      assertTrue(true)
    }
  }

  @Test
  fun refusesAnEventLargerThanTheCap() {
    val line = "data: " + "a".repeat(1000) + "\n"
    try {
      events(line.repeat(5) + "\n")
      fail("no cap")
    } catch (expected: SseTooLarge) {
      assertTrue(true)
    }
  }

  @Test
  fun stopsWhenAsked() {
    val out = mutableListOf<SseEvent>()
    var lines = 0
    val input = ByteArrayInputStream("event: ready\ndata:\n\nevent: ping\ndata:\n\n".toByteArray())
    SseReader.read(input, { lines++ >= 3 }) { out.add(it) }
    assertEquals(listOf(SseEvent("ready", "")), out)
  }
}
