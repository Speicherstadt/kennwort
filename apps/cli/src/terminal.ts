/**
 * Reading from the terminal (K-606): the passphrase and the Secret Key without echo, the server and
 * the account ID with it, and the confirmation of `get`. Read in raw mode from stdin, and only when
 * stdin is a terminal: a pipe never answers a question, so a script cannot confirm by accident
 * (it says --yes). Prompts go to stderr, so stdout carries only what was asked for.
 */
export type Typing = { text: string; state: "typing" | "done" | "aborted" };
export type Answer =
  | { ok: true; value: string }
  | { ok: false; error: "no-terminal" | "cancelled" };

const ENTER = new Set(["\r", "\n"]);
const BACKSPACE = new Set(["\x7f", "\b"]);

/** Skips an escape sequence (arrow keys and the like) starting at index; gives the next index */
const afterEscape = (chars: string[], index: number) => {
  const next = chars[index + 1];
  if (next !== "[" && next !== "O") return index + 1;
  let end = index + 2;
  while (end < chars.length && !/[@-~]/.test(chars[end] ?? "")) end++;
  return end;
};

/** One chunk of keys typed on top of what was typed before */
export const typed = (before: Typing, chunk: string): Typing => {
  if (before.state !== "typing") return before;
  const chars = [...chunk];
  let text = before.text;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] ?? "";
    if (ENTER.has(char)) return { text, state: "done" };
    if (char === "\x03" || (char === "\x04" && text === "")) return { text: "", state: "aborted" };
    if (BACKSPACE.has(char)) text = [...text].slice(0, -1).join("");
    else if (char === "\x15") text = "";
    else if (char === "\x1b") i = afterEscape(chars, i);
    else if (char >= " ") text += char;
  }
  return { text, state: "typing" };
};

/** The first line of what came on stdin, without its line ending; nothing when it was empty */
export const firstLine = (input: string): string | undefined => {
  if (input === "") return undefined;
  return input.split(/\r?\n/, 1)[0];
};

type Input = Pick<
  NodeJS.ReadStream,
  "isTTY" | "on" | "off" | "resume" | "pause" | "setEncoding"
> & {
  setRawMode?: (mode: boolean) => unknown;
};
type Output = Pick<NodeJS.WriteStream, "write">;

/** What to write so the line shows the prompt and the text: the new characters, or the line anew */
const echoed = (prompt: string, before: string, after: string) =>
  after.startsWith(before) ? after.slice(before.length) : `\r\x1b[K${prompt}${after}`;

/** Asks on the terminal; echo shows what is typed, else nothing at all, not even stars */
export const askOn =
  (input: Input, output: Output) =>
  (prompt: string, echo: boolean): Promise<Answer> => {
    if (!input.isTTY || !input.setRawMode)
      return Promise.resolve({ ok: false, error: "no-terminal" });
    const setRawMode = input.setRawMode.bind(input);
    // Raw before the prompt shows: what is typed right after it is never echoed by the terminal
    setRawMode(true);
    output.write(prompt);
    return new Promise((resolve) => {
      let typing: Typing = { text: "", state: "typing" };
      const onData = (chunk: string) => {
        const before = typing.text;
        typing = typed(typing, chunk);
        if (echo && typing.text !== before) output.write(echoed(prompt, before, typing.text));
        if (typing.state === "typing") return;
        input.off("data", onData);
        setRawMode(false);
        input.pause();
        output.write("\n");
        resolve(
          typing.state === "done"
            ? { ok: true, value: typing.text }
            : { ok: false, error: "cancelled" },
        );
      };
      input.setEncoding("utf8");
      input.on("data", onData);
      input.resume();
    });
  };

/** Everything on stdin, for --passphrase-stdin */
export const readAll = async (input: AsyncIterable<string | Uint8Array>) => {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of input)
    text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
};
