// First of all: Zod decides at each schema's definition whether to compile it with eval (P-16, CSP)
import "./without-eval.ts";
import "@kennwort/ui/styles.css";
import { callerOf, createApi } from "@kennwort/client/session/api.ts";
import { deviceIdentity } from "@kennwort/client/session/device-identity.ts";
import { linkCalls } from "@kennwort/client/session/links-api.ts";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { App, type AutofillHost } from "./app.tsx";
import { tauriInvoke } from "./mobile/native-send.ts";
import { startInApp } from "./mobile/start.tsx";
import { createNavigation, takeStartFragment } from "./navigation.ts";
import { indexedDbKeyValue } from "./offline/idb.ts";
import { createLocalCopy } from "./offline/local-copy.ts";
import { createSession } from "./session/session.ts";
import { watchForUpdates } from "./sw/register.ts";
import { UpdateNotice } from "./sw/update-notice.tsx";
import { applyTheme, readTheme } from "./theme.ts";

const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = getLocale();
  applyTheme(readTheme(globalThis.localStorage), document.documentElement, globalThis.localStorage);
  // Created once, outside JSX: a prop expression is a getter and would run on every read
  const nav = createNavigation();
  // Before anything renders: a link's secret leaves the address at once (P-04, P-12)
  const hash = takeStartFragment(nav);
  const [updateReady, setUpdateReady] = createSignal(false);
  const start = (send: typeof fetch, autofill?: AutofillHost) => {
    // Ciphertext only, to unlock and read without the server (K-308 part b)
    const copy = createLocalCopy(indexedDbKeyValue(globalThis.indexedDB));
    const identity = deviceIdentity(globalThis.localStorage, navigator.userAgent);
    const api = createApi(copy.fetch(send), identity);
    const session = createSession({ api, storage: globalThis.localStorage, copy });
    // A one-time link is fetched without the device naming itself: the recipient has no account
    const { fetchLink } = linkCalls(callerOf(send, undefined));
    render(
      () => (
        <>
          <App
            nav={nav}
            session={session}
            api={api}
            hash={hash}
            copy={copy}
            fetchLink={fetchLink}
            autofill={autofill}
          />
          <UpdateNotice ready={updateReady()} onReload={() => location.reload()} />
        </>
      ),
      root,
    );
  };
  // In the mobile app the server is the one set up at the first start (mobile/start.tsx)
  if (import.meta.env.MODE === "mobile") void startInApp(root, tauriInvoke(), start);
  else start(fetch);
  // Only a production build has a signed release to check (P-16); the dev server has none, and the
  // mobile app's build (Vite mode "mobile", K-801) is updated by its store, never by a worker
  if (import.meta.env.PROD && import.meta.env.MODE !== "mobile" && "serviceWorker" in navigator) {
    void watchForUpdates({
      container: navigator.serviceWorker,
      document,
      repeat: (run, ms) => setInterval(run, ms),
      onReady: () => setUpdateReady(true),
    });
  }
}
