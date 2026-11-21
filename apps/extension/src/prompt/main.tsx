import "@kennwort/ui/styles.css";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { browserAlarms } from "../account/auto-lock.ts";
import { createPopupAccount } from "../account/popup-account.ts";
import { serverApiFor } from "../account/server-api.ts";
import { tracksVisibility } from "../menu/visibility.ts";
import type { PromptRequest, SaveAnswer } from "../save/messages.ts";
import { browserSessionArea, KEYS_ITEM } from "../session-keys.ts";
import { SavePrompt } from "./save-prompt.tsx";

// The save prompt's page (K-404), framed hidden by the content script of the top frame with its
// nonce in the fragment. It takes the submitted login from the service worker once and keeps it
// only in this page's memory: an unlock or a lock in the popup opens the account anew here without
// reloading, so the login is not lost. Language and light or dark follow the browser.
type Runtime = { sendMessage(message: PromptRequest): Promise<SaveAnswer | undefined> };
const runtime = (globalThis as { chrome?: { runtime?: Runtime } }).chrome?.runtime;
const root = document.getElementById("root");

const start = async (element: HTMLElement, worker: Runtime) => {
  document.documentElement.lang = getLocale();
  const nonce = location.hash.slice(1);
  const request = (message: PromptRequest) => worker.sendMessage(message).catch(() => undefined);
  const taken = await request({ type: "prompt-take", nonce });
  if (!taken?.ok || !taken.capture) return void request({ type: "prompt-close", nonce });
  const capture = taken.capture;
  const area = browserSessionArea();
  const show = () =>
    render(
      () => (
        <SavePrompt
          account={createPopupAccount({
            area,
            alarms: browserAlarms(),
            apiFor: serverApiFor((input, init) => fetch(input, init), navigator.userAgent),
            movesLock: false,
          })}
          capture={capture}
          bridge={{ nonce, request, now: () => performance.now(), verifiable: tracksVisibility() }}
        />
      ),
      element,
    );
  let dispose = show();
  area?.onChanged?.addListener((changes) => {
    if (!(KEYS_ITEM in changes)) return;
    dispose();
    dispose = show();
  });
};

if (root && runtime) void start(root, runtime);
