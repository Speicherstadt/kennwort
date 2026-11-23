// The stand-in for Have I Been Pwned's Pwned Passwords in the e2e tests (K-603): the passwords it
// reports as leaked, and its port. The e2e server asks it instead of the real service
// (KENNWORT_PWNED_URL in playwright.config.ts), so no test ever reaches the internet.
import { createHash } from "node:crypto";

export const PWNED_PORT = 28090;

/** Strong by the rule of „Zum Ändern“, but in the stand-in's leak list */
export const LEAKED_PASSWORD = "Werkstatt-Schluessel-2019!";
export const LEAKED_COUNT = 1337;

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex").toUpperCase();

/**
 * A range as the service sends it with `Add-Padding: true`: the leaked suffixes under the prefix,
 * and made-up suffixes with count 0, CRLF between the lines
 */
export const rangeOf = (prefix: string) => {
  const hash = sha1(LEAKED_PASSWORD);
  const leaked = hash.startsWith(prefix) ? [`${hash.slice(5)}:${LEAKED_COUNT}`] : [];
  const padding = Array.from({ length: 20 }, (_, i) => {
    const hex = i.toString(16).toUpperCase().padStart(2, "0");
    return `${hex.repeat(18).slice(0, 35)}:0`;
  });
  return [...padding.slice(0, 10), ...leaked, ...padding.slice(10)].join("\r\n");
};
