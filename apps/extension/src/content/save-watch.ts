/**
 * The content script's part in saving a login (K-404): it notices a sign-in or change-password
 * submit the user made, hands the login straight to the service worker and keeps nothing of it,
 * and in the top frame opens the save prompt when the worker has a login to offer.
 *
 * A submit counts only when the browser delivered it (`isTrusted`) right after a real click or key
 * press of the user (ACTION_MS) on the login itself: in its form or on a button of that form, on
 * the button of a login without a form, in the field Enter was pressed in. A page that submits by
 * script, with `form.submit()` (no event at all) or `requestSubmit()`, captures nothing, also not
 * right after the user clicked something else (a cookie banner) or a label the page linked to the
 * form's button. A click on a button of the login form and Enter in a login field without a form
 * count as a submit too, for pages that sign in by script (fetch) without submitting a form. Only in the top frame or a frame of the same origin as every
 * frame above it (same-origin.ts), and only from fields the page shows (capture.ts).
 *
 * When is the sign-in done? A page that navigates after it: the next page's content script asks the
 * worker on load. A page that stays: once the password field the user submitted is gone or hidden
 * within WATCH_MS; a field that stays, also one the page only emptied, reads as a failed sign-in,
 * and nothing is offered. In a same-origin child frame only the first way works: the prompt belongs to the top
 * frame, which learns of the login when it loads anew.
 */
import { newNonce } from "../fill/messages.ts";
import {
  type CaptureRequest,
  promptContentMessage,
  type SaveAnswer,
  type Submitted,
} from "../save/messages.ts";
import { inputsOf, submittedLogin } from "./capture.ts";
import { fieldShown } from "./field-shown.ts";
import type { PromptFrame } from "./prompt-frame.ts";

/** A submit counts this soon after a real click or key press */
export const ACTION_MS = 1_000;
/** How long a page that stays is watched for its sign-in to finish */
export const WATCH_MS = 10_000;
const WATCH_EVERY_MS = 250;

export type SaveWatchDeps = {
  /** The prompt's frame; only the top frame has one */
  frame: PromptFrame | undefined;
  /** Whether this frame may capture at all (same-origin.ts) */
  mayCapture: () => boolean;
  /** A message to the service worker; undefined when nothing answered */
  send: (request: CaptureRequest) => Promise<SaveAnswer | undefined>;
  extensionId: string;
  random: (length: number) => Uint8Array;
  now: () => number;
  repeat: (run: () => void, ms: number) => unknown;
  stop: (timer: unknown) => void;
  shown?: (input: HTMLInputElement) => boolean;
};

type Sender = { id?: string; tab?: unknown };

const BUTTON = 'button, input[type="submit"], input[type="button"], [role="button"]';

const isInput = (node: unknown): node is HTMLInputElement =>
  typeof node === "object" && node !== null && (node as Element).tagName === "INPUT";

const elementOf = (node: unknown): Element | undefined =>
  typeof node === "object" && node !== null && "closest" in node ? (node as Element) : undefined;

/** Whether a node lies in a container, also inside a shadow root under it */
const within = (container: Node, node: Node) => {
  for (let at: Node | null = node; at; at = at.parentNode ?? (at as ShadowRoot).host ?? null)
    if (at === container) return true;
  return false;
};

/** In a form, or on a control of it outside it (`form="…"`) */
const inForm = (form: HTMLFormElement) => (target: Element) =>
  within(form, target) ||
  (target.closest("button, input") as HTMLButtonElement | null)?.form === form;

/** The password field a login was read from, to watch it */
const passwordField = (inputs: readonly HTMLInputElement[], login: Submitted) =>
  inputs.find((input) => input.type === "password" && input.value === login.password);

/** The user's last real click or key press and where it went: a submit counts after one on the login */
const trackUserActions = (now: () => number) => {
  let last: { at: number; target: Element | undefined } = {
    at: Number.NEGATIVE_INFINITY,
    target: undefined,
  };
  return {
    note: (event: Event) => {
      if (event.isTrusted) last = { at: now(), target: elementOf(event.composedPath()[0]) };
    },
    /** Whether the last one came just now and went to the login (`on`) */
    actedOn: (on: (target: Element) => boolean) =>
      now() - last.at <= ACTION_MS && last.target !== undefined && on(last.target),
  };
};

export const createSaveWatch = (deps: SaveWatchDeps) => {
  const shown = deps.shown ?? fieldShown;
  const actions = trackUserActions(deps.now);
  let watch: { timer: unknown; field: HTMLInputElement; login: Submitted } | undefined;
  let promptNonce: string | undefined;

  const stopWatching = () => {
    if (watch) deps.stop(watch.timer);
    watch = undefined;
  };

  /** Asks the worker for a login to offer and opens the prompt, hidden, if there is one */
  const askPending = async () => {
    if (!deps.frame) return;
    const answer = await deps.send({ type: "save-pending" });
    if (!answer?.ok) return;
    promptNonce = newNonce(deps.random);
    deps.frame.open(promptNonce);
  };

  /** The sign-in is done once the submitted password field is gone or hidden */
  const watchField = (field: HTMLInputElement, login: Submitted) => {
    stopWatching();
    const until = deps.now() + WATCH_MS;
    const timer = deps.repeat(() => {
      const done = !field.isConnected || !shown(field);
      if (!done && deps.now() < until) return;
      stopWatching();
      if (done) void askPending();
    }, WATCH_EVERY_MS);
    watch = { timer, field, login };
  };

  const capture = async (inputs: readonly HTMLInputElement[], on: (target: Element) => boolean) => {
    if (!actions.actedOn(on) || !deps.mayCapture()) return;
    const login = submittedLogin(inputs, shown);
    if (!login) return;
    const field = passwordField(inputs, login);
    // The same login once more (a click on the button, then its form's submit): one capture
    if (watch?.field === field && watch?.login.password === login.password) return;
    const answer = await deps.send({ type: "save-capture", ...login });
    if (answer?.ok && field) watchField(field, login);
  };

  return {
    /** A click or key press the browser delivered: a submit right after it is the user's */
    onUserAction: actions.note,
    onSubmit: (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!event.isTrusted || form?.tagName !== "FORM") return;
      void capture(inputsOf(form), inForm(form));
    },
    /** A click on a button of a login form, or of a page whose login has no form */
    onClick: (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const button = elementOf(event.composedPath()[0])?.closest(BUTTON);
      if (!button) return;
      const form = (button as HTMLButtonElement).form ?? button.closest("form");
      const doc = button.ownerDocument;
      const inputs = inputsOf(form ?? doc);
      // Without a form, only a button after the password field signs in
      if (!form) {
        const password = inputs.find((input) => input.type === "password");
        const after = password?.compareDocumentPosition(button);
        if (!after || !(after & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      }
      void capture(inputs, form ? inForm(form) : (target) => within(button, target));
    },
    /** Enter in a login field without a form: a form's own Enter arrives as its submit */
    onKeyDown: (event: KeyboardEvent) => {
      if (!event.isTrusted || event.key !== "Enter") return;
      const field = event.composedPath()[0];
      if (!isInput(field) || field.form) return;
      void capture(inputsOf(field.ownerDocument), (target) => target === field);
    },
    /** The page is left: what it watched no longer matters, the next page asks on load */
    onPageHide: stopWatching,
    /** The top frame asks when it loads: a sign-in that navigated here may be waiting */
    onLoad: () => void askPending(),
    onViewportChange: () => deps.frame?.place(),
    /** A runtime message about the prompt; the answer goes back to the worker */
    onMessage: (raw: unknown, sender: Sender): { ok: boolean } | undefined => {
      if (sender.id !== deps.extensionId || sender.tab !== undefined) return undefined;
      const message = promptContentMessage(raw);
      if (!message || !deps.frame || !promptNonce || message.nonce !== promptNonce)
        return undefined;
      switch (message.type) {
        case "kennwort-prompt-owns":
          return { ok: deps.frame.isOpen() };
        case "kennwort-prompt-show":
          deps.frame.show();
          return { ok: true };
        case "kennwort-prompt-size":
          deps.frame.resize(message.height);
          return { ok: true };
        case "kennwort-prompt-check":
          return { ok: deps.frame.isClear() };
        case "kennwort-prompt-close":
          deps.frame.close();
          promptNonce = undefined;
          return { ok: true };
      }
    },
  };
};
