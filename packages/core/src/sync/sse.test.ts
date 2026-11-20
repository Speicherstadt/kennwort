import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSse } from "./sse.ts";

describe("parseSse", () => {
  it("reads named events, joins data lines and skips comments", () => {
    const text =
      ': keep-alive\n\nevent: record\ndata: {"a":1}\n\ndata: one\ndata:two\n\nevent: ready\ndata\n\n';
    expect(parseSse(text)).toEqual({
      events: [
        { event: "record", data: '{"a":1}' },
        { event: "message", data: "one\ntwo" },
        { event: "ready", data: "" },
      ],
      rest: "",
    });
  });

  it("hands back what has not ended yet, and accepts CR LF and CR line ends", () => {
    expect(parseSse("event: ready\r\ndata: x\r\n\r\nevent: rec")).toEqual({
      events: [{ event: "ready", data: "x" }],
      rest: "event: rec",
    });
    expect(parseSse("data: a\r\rdata: b").events).toEqual([{ event: "message", data: "a" }]);
  });

  it("keeps a colon inside the value and drops only one leading space", () => {
    expect(parseSse("data:  a: b\n\n").events).toEqual([{ event: "message", data: " a: b" }]);
  });

  it("reads a field name without a colon as a field with an empty value", () => {
    expect(parseSse("data\n\n").events).toEqual([{ event: "message", data: "" }]);
  });

  it("keeps spaces inside a value", () => {
    expect(parseSse("data:a b\n\n").events).toEqual([{ event: "message", data: "a b" }]);
  });

  it("ignores unknown fields and an event without data or name", () => {
    expect(parseSse("id: 7\nretry: 10\n\n").events).toEqual([]);
    expect(parseSse("id: 7\nevent: ping\n\n").events).toEqual([{ event: "ping", data: "" }]);
  });

  it("gives the same events however the stream is cut into chunks", () => {
    const line = fc.stringMatching(/^[a-z0-9 {}":,]{0,12}$/);
    const event = fc.record({ event: fc.constantFrom("record", "ready", "ping"), data: line });
    fc.assert(
      fc.property(
        fc.array(event, { maxLength: 6 }),
        fc.array(fc.nat(), { maxLength: 8 }),
        (events, cuts) => {
          const text = events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join("");
          const points = [...new Set(cuts.map((cut) => cut % (text.length + 1)))].sort(
            (a, b) => a - b,
          );
          const ends = [...points, text.length];
          const chunks = ends.map((end, k) => text.slice(k === 0 ? 0 : ends[k - 1], end));
          let rest = "";
          const seen = chunks.flatMap((chunk) => {
            const parsed = parseSse(rest + chunk);
            rest = parsed.rest;
            return parsed.events;
          });
          expect(seen).toEqual(events);
        },
      ),
    );
  });
});
