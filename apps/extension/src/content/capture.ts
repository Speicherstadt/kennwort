/**
 * What a user submits in a sign-in or change-password form (K-404), read from the fields the page
 * shows (field-shown.ts): a password field the page hides is never read, so a page cannot slip a
 * value the user never saw into a saved login. Only filled, usable fields count.
 *
 * - One password field: a sign-in. The user name is the field before it marked as one, else the
 *   last text field before it, as for filling (login-fields.ts).
 * - Several: a change-password form. Fields marked `new-password` are the new password, else the
 *   last two are new and confirmation (three fields: current, new, confirmation) or, with two
 *   different values, current and new. A confirmation that differs from the new password reads as
 *   a typo: nothing is captured.
 */
import type { Submitted } from "../save/messages.ts";
import { saysAutocomplete } from "./autocomplete.ts";
import { fieldShown } from "./field-shown.ts";

type Shown = (input: HTMLInputElement) => boolean;

const USER_TYPES = new Set(["text", "email", "tel"]);

const usable = (input: HTMLInputElement) => !input.disabled && !input.readOnly;
const saysUsername = (input: HTMLInputElement) =>
  saysAutocomplete(input, "username", "email") || input.type === "email";
const saysNew = (input: HTMLInputElement) => saysAutocomplete(input, "new-password");

/** The inputs a submit covers: a form's own, or those of a document without a form */
export const inputsOf = (scope: HTMLFormElement | Document): HTMLInputElement[] => {
  const form = scope.nodeType === Node.DOCUMENT_NODE ? null : (scope as HTMLFormElement);
  return (Array.from(scope.querySelectorAll("input")) as HTMLInputElement[]).filter(
    (input) => (input.form ?? null) === form,
  );
};

/** New and current password among several password fields, or undefined for a typo */
const changeOf = (passwords: HTMLInputElement[]) => {
  const marked = passwords.filter(saysNew);
  const fresh = marked.length > 0 ? marked : passwords.slice(-2);
  const values = new Set(fresh.map((input) => input.value));
  if (marked.length === 0 && passwords.length === 2 && values.size === 2) {
    const [current, next] = passwords as [HTMLInputElement, HTMLInputElement];
    return { password: next.value, previous: current.value };
  }
  if (values.size !== 1) return undefined;
  const current = passwords.find((input) => !fresh.includes(input));
  const password = (fresh[0] as HTMLInputElement).value;
  return current ? { password, previous: current.value } : { password };
};

/** The login a submit of these inputs carries, or undefined when it carries none */
export const submittedLogin = (
  inputs: readonly HTMLInputElement[],
  shown: Shown = fieldShown,
): Submitted | undefined => {
  const filled = (input: HTMLInputElement) => input.value !== "" && usable(input) && shown(input);
  const passwords = inputs.filter((input) => input.type === "password" && filled(input));
  const first = passwords[0];
  if (!first) return undefined;
  const before = inputs
    .slice(0, inputs.indexOf(first))
    .filter((input) => USER_TYPES.has(input.type) && filled(input));
  const username = (before.find(saysUsername) ?? before.at(-1))?.value ?? "";
  if (passwords.length === 1) return { username, password: first.value };
  const change = changeOf(passwords);
  return change && { username, ...change };
};
