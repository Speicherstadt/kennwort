import "@kennwort/ui/styles.css";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { browserAlarms } from "../account/auto-lock.ts";
import { createPopupAccount } from "../account/popup-account.ts";
import { serverApiFor } from "../account/server-api.ts";
import { warningOf } from "../alert/messages.ts";
import { tracksVisibility } from "../menu/visibility.ts";
import { ceremonyOf, type PasskeyAnswer } from "../passkey/messages.ts";
import type { Capture, PromptRequest, SaveAnswer } from "../save/messages.ts";
import { browserSessionArea, KEYS_ITEM } from "../session-keys.ts";
import { PasskeyPrompt } from "./passkey-prompt.tsx";
import { PhishingWarning } from "./phishing-warning.tsx";
import { SavePrompt } from "./save-prompt.tsx";

// The save prompt's page (K-404), framed hidden by the content script of the top frame with its
// nonce in the fragment. It takes the submitted login from the service worker once and keeps it
// only in this page's memory: an unlock or a lock in the popup opens the account anew here without
// reloading, so the login is not lost. A phishing warning (K-405) comes the same way and takes
// the page instead of the login, and so does a passkey ceremony (K-406), which the page answers once
// and then closes. Language and light or dark follow the browser.
type Runtime = { sendMessage(message: PromptRequest): Promise<SaveAnswer | undefined> };
const runtime = (globalThis as { chrome?: { runtime?: Runtime } }).chrome?.runtime;
const root = document.getElementById("root");

const start = async (element: HTMLElement, worker: Runtime) => {
  document.documentElement.lang = getLocale();
  const nonce = location.hash.slice(1);
  const request = (message: PromptRequest) => worker.sendMessage(message).catch(() => undefined);
  const taken = await request({ type: "prompt-take", nonce });
  const ceremony = taken?.ok ? ceremonyOf(taken.ceremony) : undefined;
  const warning = taken?.ok ? warningOf(taken.warning) : undefined;
  const capture = taken?.ok ? taken.capture : undefined;
  if (!ceremony && !warning && !capture) return void request({ type: "prompt-close", nonce });
  const area = browserSessionArea();
  const bridge = { nonce, request, now: () => performance.now(), verifiable: tracksVisibility() };
  // Once only, also when a lock or an unlock renders the page anew
  let answered = false;
  const answer = (passkeyAnswer: PasskeyAnswer) => {
    if (answered) return;
    answered = true;
    void request({ type: "prompt-passkey", nonce, answer: passkeyAnswer }).then(() =>
      request({ type: "prompt-close", nonce }),
    );
  };
  const show = () => {
    // Made once per render, outside the JSX: a prop expression runs anew on every read
    const account = createPopupAccount({
      area,
      alarms: browserAlarms(),
      apiFor: serverApiFor((input, init) => fetch(input, init), navigator.userAgent),
      movesLock: false,
    });
    return render(
      () =>
        ceremony ? (
          <PasskeyPrompt account={account} ceremony={ceremony} bridge={bridge} onAnswer={answer} />
        ) : warning ? (
          <PhishingWarning account={account} warning={warning} bridge={bridge} />
        ) : (
          <SavePrompt account={account} capture={capture as Capture} bridge={bridge} />
        ),
      element,
    );
  };
  let dispose = show();
  area?.onChanged?.addListener((changes) => {
    if (!(KEYS_ITEM in changes)) return;
    dispose();
    dispose = show();
  });
};

if (root && runtime) void start(root, runtime);
