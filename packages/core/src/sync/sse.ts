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

// A line ends in CR LF, CR or LF; two line ends make a blank line. A CR followed by LF is one line
// end, so "\r\n" alone never counts as blank.
const LINE_END = String.raw`(?:\r\n|\r(?!\n)|\n)`;
const BLANK_LINE = new RegExp(LINE_END + LINE_END, "g");

/**
 * What follows the last blank line goes back unchanged: a CR LF cut by the chunking stays whole,
 * and an LF left over from one only adds an empty line, which means nothing (review of K-204).
 */
export const parseSse = (text: string): { events: SseEvent[]; rest: string } => {
  const ends = [...text.matchAll(BLANK_LINE)];
  const last = ends.at(-1);
  if (!last) return { events: [], rest: text };
  const blocks = text.slice(0, last.index).split(BLANK_LINE);
  return {
    events: blocks.flatMap((block) => toEvent(block.replace(/\r\n?/g, "\n")) ?? []),
    rest: text.slice(last.index + last[0].length),
  };
};
