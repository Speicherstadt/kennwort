/**
 * Starting the web app inside the mobile app (Vite mode "mobile", K-801): with the origin stored at
 * the first start, or after asking for it (server-setup.tsx). Every API call then goes through
 * serverFetch to that origin only, and through the Rust side (native-send.ts), never from the
 * webview itself: its CSP keeps `connect-src 'self'`.
 */
import { serverFetch } from "@kennwort/client/session/server-fetch.ts";
import { render } from "@solidjs/web";
import type { AutofillHost } from "../app.tsx";
import { nativeAutofill } from "./autofill-native.ts";
import { appServer, type Invoke, nativeSend } from "./native-send.ts";
import { ServerSetup } from "./server-setup.tsx";

/** The app's fetch for one origin: the webview's checks first, then Rust's */
export const appFetch = (origin: string, invoke: Invoke): typeof fetch =>
  serverFetch(origin, nativeSend(origin, invoke));

export const startInApp = async (
  root: HTMLElement,
  invoke: Invoke | undefined,
  start: (send: typeof fetch, autofill?: AutofillHost) => void,
) => {
  // Outside the Tauri shell nothing can reach a server: no IPC, and connect-src is 'self'
  if (!invoke) return;
  // Its own chunk: the matcher's Public Suffix List stays out of the web app's start (K-802)
  const { autofillHost } = await import("./autofill-sheet.tsx");
  const autofill = autofillHost(nativeAutofill(invoke));
  const server = appServer(invoke);
  const stored = await server.stored();
  if (stored) return start(appFetch(stored, invoke), autofill);
  const dispose = render(
    () => (
      <ServerSetup
        server={server}
        onReady={(origin) => {
          dispose();
          start(appFetch(origin, invoke), autofill);
        }}
      />
    ),
    root,
  );
};
