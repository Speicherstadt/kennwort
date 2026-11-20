/** A link inside the app: a real <a href> (open in new tab works), navigated without reload */
import type { JSX } from "@solidjs/web";
import { isPlainClick, type Navigation } from "../navigation.ts";

export type LinkProps = {
  nav: Navigation;
  href: string;
  current?: boolean;
  class?: string;
  label?: string;
  children: JSX.Element;
};

export const Link = (props: LinkProps) => (
  <a
    href={props.href}
    class={props.class}
    aria-label={props.label}
    aria-current={props.current ? "page" : undefined}
    onClick={(event) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      props.nav.go(props.href);
    }}
  >
    {props.children}
  </a>
);
