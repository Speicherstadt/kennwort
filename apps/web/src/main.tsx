import "@kennwort/ui/styles.css";
import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { App } from "./app.tsx";
import { createNavigation } from "./navigation.ts";
import { createApi } from "./session/api.ts";
import { deviceIdentity } from "./session/device-identity.ts";
import { createSession } from "./session/session.ts";
import { applyTheme, readTheme } from "./theme.ts";

const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = getLocale();
  applyTheme(readTheme(globalThis.localStorage), document.documentElement, globalThis.localStorage);
  // Created once, outside JSX: a prop expression is a getter and would run on every read
  const nav = createNavigation();
  const api = createApi(fetch, deviceIdentity(globalThis.localStorage, navigator.userAgent));
  const session = createSession({ api, storage: globalThis.localStorage });
  render(() => <App nav={nav} session={session} api={api} />, root);
}
