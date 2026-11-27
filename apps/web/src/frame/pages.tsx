/** The other sections: generator and a page that does not exist (settings: settings-page.tsx) */
import { m, pageClass, type Toasts } from "@kennwort/ui";
import { GeneratorPanel } from "@kennwort/ui/generator/generator-panel.tsx";
import type { JSX } from "@solidjs/web";
import type { Navigation } from "../navigation.ts";
import { Link } from "./link.tsx";

const Page = (props: { title: string; children: JSX.Element }) => (
  <section aria-labelledby="page-title" class={pageClass()}>
    <h1 id="page-title" class="mb-4 text-[28px] font-semibold md:text-lg">
      {props.title}
    </h1>
    {props.children}
  </section>
);

export const GeneratorPage = (props: { toasts: Toasts }) => (
  <Page title={m.nav_generator()}>
    <p class="mb-4 text-muted-foreground">{m.generator_intro()}</p>
    <GeneratorPanel toasts={props.toasts} storage={globalThis.localStorage} />
  </Page>
);

export const NotFoundPage = (props: { nav: Navigation }) => (
  <Page title={m.not_found_title()}>
    <Link nav={props.nav} href="/entries" class="underline">
      {m.not_found_back()}
    </Link>
  </Page>
);
