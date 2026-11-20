/**
 * Server-sent events read from a text stream (WHATWG HTML, "Server-sent events", 9.2.6): events end
 * at a blank line, "event:" names one, "data:" lines join with a line break, lines starting with a
 * colon are comments. What has not ended yet is handed back to be continued with the next chunk.
 */
export type SseEvent = { event: string; data: string };

const field = (line: string) => {
  const colon = line.indexOf(":");
  const name = colon === -1 ? line : line.slice(0, colon);
  const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
  return { name, value };
};

const toEvent = (block: string): SseEvent | undefined => {
  let event = "message";
  const data: string[] = [];
  // Blank lines and comments (":…") have an empty field name and fall through like unknown fields
  for (const line of block.split("\n")) {
    const { name, value } = field(line);
    if (name === "event") event = value;
    else if (name === "data") data.push(value);
  }
  return data.length === 0 && event === "message" ? undefined : { event, data: data.join("\n") };
};

export const parseSse = (text: string): { events: SseEvent[]; rest: string } => {
  const normalized = text.replace(/\r\n?/g, "\n");
  const end = normalized.lastIndexOf("\n\n");
  if (end === -1) return { events: [], rest: normalized };
  const blocks = normalized.slice(0, end).split("\n\n");
  return {
    events: blocks.flatMap((block) => toEvent(block) ?? []),
    rest: normalized.slice(end + 2),
  };
};
