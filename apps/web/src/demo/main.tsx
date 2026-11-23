/**
 * The demo's entry (K-706): the real app over the stand-in in this tab, published under /demo/ of
 * the docs site. A build of its own (vite.demo.config.ts), so the app's release keeps its CSP and
 * its signed service worker untouched: the demo registers no service worker, keeps no offline copy
 * and remembers nothing beyond the tab's memory, so a reload starts with a new company.
 */
// First of all: Zod decides at each schema's definition whether to compile it with eval (P-16, CSP)
import "../without-eval.ts";
// The app's look with the demo's layout around it
import "../../demo/styles.css";
import { createApi } from "@kennwort/client/session/api.ts";
import { getLocale, m } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createMemoryHistory } from "@tanstack/solid-router";
import { createSignal, Match, Switch } from "solid-js";
import { App } from "../app.tsx";
import { createNavigation } from "../navigation.ts";
import { createAppRouter } from "../router.ts";
import { rememberDevice } from "../session/device.ts";
import { createSession, type Session } from "../session/session.ts";
import { applyTheme, readTheme } from "../theme.ts";
import { DemoBanner, DemoUnavailable } from "./demo-banner.tsx";
import { demoFetch } from "./demo-fetch.ts";
import { seedDemo } from "./seed.ts";

/** The device's memory for the tab only: account ID and Secret Key of the seeded Jonas */
const tabStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

type Ready = { session: Session; api: ReturnType<typeof createApi> };

const start = async (onUnavailable: () => void): Promise<Ready> => {
  const seeded = await seedDemo();
  const storage = tabStorage();
  rememberDevice(storage, seeded.accountId, seeded.secretKey);
  const api = createApi(demoFetch(seeded.store, onUnavailable));
  return { session: createSession({ api, storage }), api };
};

const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = getLocale();
  applyTheme(readTheme(globalThis.localStorage), document.documentElement, globalThis.localStorage);
  // Addresses stay in memory: GitHub Pages knows only /demo/, and a reload starts over anyway
  const nav = createNavigation(window, createAppRouter(createMemoryHistory()));
  const [ready, setReady] = createSignal<Ready | "failed">();
  const [unavailable, setUnavailable] = createSignal(false);
  start(() => setUnavailable(true)).then(setReady, () => setReady("failed"));
  render(
    () => (
      <>
        <DemoBanner />
        <DemoUnavailable shown={unavailable()} onClose={() => setUnavailable(false)} />
        <div class="demo-app">
          <Switch fallback={<p class="p-6 text-sm text-muted-foreground">{m.demo_preparing()}</p>}>
            <Match when={ready() === "failed"}>
              <p class="p-6 text-sm">{m.demo_failed()}</p>
            </Match>
            <Match when={ready() as Ready | undefined}>
              {(value) => <App nav={nav} session={value().session} api={value().api} hash="" />}
            </Match>
          </Switch>
        </div>
      </>
    ),
    root,
  );
}
