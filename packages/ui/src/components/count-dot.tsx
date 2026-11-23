/**
 * The small round count on an icon, as shadcn puts it on a bell: the one badge that stays round.
 * Decorative; the link around it says the count in words. "99+" past 99 so it stays small.
 */
import type { JSX } from "@solidjs/web";
export const CountDot = (props: { count: number }): JSX.Element => (
  <span
    aria-hidden="true"
    class="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
  >
    {props.count > 99 ? "99+" : String(props.count)}
  </span>
);
