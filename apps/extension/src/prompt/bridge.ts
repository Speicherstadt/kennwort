/**
 * What the save prompt needs from the browser (K-404), and the gate in front of every write: a
 * click counts only when the browser delivered it (`isTrusted`) while the prompt was visible,
 * uncovered and opaque for a while, still is CONFIRM_MS later (menu/visibility.ts, as for filling),
 * and the content script finds the prompt's element clear in the page (content/prompt-frame.ts).
 */
import { CONFIRM_MS, type VisibilityGuard, type watchVisibility } from "../menu/visibility.ts";
import type { PromptRequest, SaveAnswer } from "../save/messages.ts";

/** Tests pass fakes */
export type PromptBridge = {
  nonce: string;
  request: (request: PromptRequest) => Promise<SaveAnswer | undefined>;
  now: () => number;
  /** Whether the browser reports visibility (IntersectionObserver v2) */
  verifiable: boolean;
  trusted?: (event: Event) => boolean;
  wait?: (ms: number) => Promise<void>;
  Observer?: Parameters<typeof watchVisibility>[3];
};

export const waitOf = (bridge: PromptBridge) =>
  bridge.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

/** Whether a click on the prompt counts as the user's */
export const confirmed = async (bridge: PromptBridge, guard: VisibilityGuard, event: Event) => {
  const trusted = bridge.trusted ?? ((e: Event) => e.isTrusted);
  if (!trusted(event) || !guard.armed(bridge.now())) return false;
  await waitOf(bridge)(CONFIRM_MS);
  if (!guard.armed(bridge.now())) return false;
  const clear = await bridge.request({ type: "prompt-check", nonce: bridge.nonce });
  return clear?.ok === true;
};

/** Asks the worker to pass a request for the prompt's frame on to the content script */
export const frameRequest = (bridge: PromptBridge, type: "prompt-show" | "prompt-close") =>
  void bridge.request({ type, nonce: bridge.nonce });
