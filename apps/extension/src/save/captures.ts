/**
 * The logins the service worker holds between a submit and the save prompt (K-404): in its memory
 * only, one per tab, never in a storage area. A login is offered once, to the first top-frame
 * document of its tab that asks within OFFER_MS of the submit (the page after a sign-in that
 * navigates, or the same page after one that does not), and handed to that document's prompt once;
 * then the worker forgets it. Whatever is not taken is forgotten after KEEP_MS, and all of it when
 * the browser stops the worker.
 */
import type { Capture } from "./messages.ts";

/** A submit is offered only this soon after it happened */
export const OFFER_MS = 30_000;
/** A login nobody took is forgotten this long after the submit */
export const KEEP_MS = 60_000;

type Held = { capture: Capture; at: number; offered: boolean };

export type CaptureDeps = {
  now: () => number;
  /** Runs a function later (setTimeout); tests pass one they control */
  schedule: (run: () => void, ms: number) => unknown;
};

export const createCaptures = (deps: CaptureDeps) => {
  const held = new Map<number, Held>();
  const fresh = (tabId: number, within: number) => {
    const entry = held.get(tabId);
    if (entry && deps.now() - entry.at <= within) return entry;
    held.delete(tabId);
    return undefined;
  };
  return {
    /** Holds the tab's newest submit; an older one of the same tab is replaced */
    put: (tabId: number, capture: Capture) => {
      const entry: Held = { capture, at: deps.now(), offered: false };
      held.set(tabId, entry);
      deps.schedule(() => {
        if (held.get(tabId) === entry) held.delete(tabId);
      }, KEEP_MS);
    },
    /** Whether the tab has a submit to offer; true only once per submit */
    offer: (tabId: number) => {
      const entry = fresh(tabId, OFFER_MS);
      if (!entry || entry.offered) return false;
      entry.offered = true;
      return true;
    },
    /** The offered submit, handed over once; the worker keeps nothing of it after */
    take: (tabId: number): Capture | undefined => {
      const entry = fresh(tabId, KEEP_MS);
      if (!entry?.offered) return undefined;
      held.delete(tabId);
      return entry.capture;
    },
    /** A tab that closed or navigated away keeps nothing */
    drop: (tabId: number) => held.delete(tabId),
  };
};

export type Captures = ReturnType<typeof createCaptures>;
