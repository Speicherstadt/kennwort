import "@kennwort/ui/styles.css";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { App } from "./app.tsx";
import { createNavigation } from "./navigation.ts";
import { createApi } from "./session/api.ts";
import { deviceIdentity } from "./session/device-identity.ts";
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
  const api = createApi(fetch, deviceIdentity(globalThis.localStorage, navigator.userAgent));
  const session = createSession({ api, storage: globalThis.localStorage });
  const [updateReady, setUpdateReady] = createSignal(false);
  render(
    () => (
      <>
        <App nav={nav} session={session} api={api} />
        <UpdateNotice ready={updateReady()} onReload={() => location.reload()} />
      </>
    ),
    root,
  );
  // Only a production build has a signed release to check (P-16); the dev server has none
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    void watchForUpdates({
      container: navigator.serviceWorker,
      document,
      repeat: (run, ms) => setInterval(run, ms),
      onReady: () => setUpdateReady(true),
    });
  }
}
