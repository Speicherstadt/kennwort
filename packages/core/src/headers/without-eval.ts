/**
 * The web app's CSP forbids eval (security-headers.ts), so Zod must not compile its parsers with
 * `new Function`: it would only probe, fail and fall back, but each probe is a CSP violation
 * report. The web app calls this before anything is parsed.
 */
import { z } from "zod";

export const parseWithoutEval = () => {
  z.config({ jitless: true });
};
