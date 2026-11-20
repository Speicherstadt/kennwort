// Regression (review of K-204): a CR LF line end split across two chunks must count as one line end
// (WHATWG HTML 9.2.6); watchVault otherwise loses the change event
import { describe, expect, it } from "vitest";
import { encodeBytes } from "./bytes.ts";
import { type Connection, type LiveEvent, watchVault } from "./http.ts";
import { contextFor, id, jonas } from "./test/fixtures.ts";

const vaultId = contextFor(jonas).ring.vaultId;

const streaming = (chunks: string[]): Connection => ({
  fetch: (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )) as unknown as typeof fetch,
  baseUrl: "https://kennwort.weber-haustechnik.test",
  token: "t",
});

describe("watchVault with CR LF line ends", () => {
  it("reports a change whose CR LF is cut between two chunks", async () => {
    const data = JSON.stringify({ entryId: encodeBytes(id(0xe1)), version: 2 });
    const events: LiveEvent[] = [];
    await watchVault(streaming(["event: record\r", `\ndata: ${data}\r\n\r\n`]), vaultId, (event) =>
      events.push(event),
    );
    expect(events).toEqual([{ type: "change", entryId: id(0xe1), version: 2 }]);
  });
});
