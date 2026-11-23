/**
 * The account state this machine last saw or wrote (K-606), sealed under AK as the server keeps it
 * and as the web app keeps it in its offline copy: merged into whatever the server serves at the
 * next command, so a server that plays back an older state cannot throw the CLI back behind what it
 * has checked, such as how far each vault log reached (E-07, E-13; packages/client, kept-state.ts).
 * Without AK it is only ciphertext. A file that is missing, damaged or of another account counts as
 * none and is replaced at the next write.
 */
import type { KeptState } from "@kennwort/client/session/state-sync.ts";
import { bytes, encodeBytes } from "@kennwort/core";
import { readPrivate, writePrivate } from "./private-file.ts";

const VERSION = 1;

export type StateKeeper = {
  read: () => KeptState | undefined;
  keep: (kept: KeptState) => boolean;
};

const parse = (text: string): KeptState | undefined => {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const sealed = bytes().safeParse(raw?.sealed);
    const counter = raw?.counter;
    if (raw?.version !== VERSION || !sealed.success) return undefined;
    return Number.isSafeInteger(counter) && (counter as number) >= 0
      ? { counter: counter as number, sealed: sealed.data }
      : undefined;
  } catch {
    return undefined;
  }
};

export const stateKeeper = (path: string): StateKeeper => ({
  read: () => {
    const read = readPrivate(path);
    return read.ok && read.value !== undefined ? parse(read.value) : undefined;
  },
  keep: (kept) =>
    writePrivate(
      path,
      `${JSON.stringify({ version: VERSION, counter: kept.counter, sealed: encodeBytes(kept.sealed) })}\n`,
    ),
});
