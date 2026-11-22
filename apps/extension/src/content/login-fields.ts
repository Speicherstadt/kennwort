/**
 * Login fields on a page (K-403): a password field, and the user name field before it in the same
 * form, or a user name field with a password field after it. The content script reads only the
 * page's own document: fields inside another frame belong to that frame's content script, which
 * decides for itself whether it may show a menu (same-origin.ts). Only fields the page shows count
 * (field-shown.ts): a hidden password field after a user name field is no part of its login.
 */
import { saysAutocomplete } from "./autocomplete.ts";
import { fieldShown } from "./field-shown.ts";

/** The fields one fill writes into; at least one of them is there */
export type Login = { username?: HTMLInputElement; password?: HTMLInputElement };

const USER_TYPES = new Set(["text", "email", "tel"]);

const isInput = (node: unknown): node is HTMLInputElement =>
  typeof node === "object" && node !== null && (node as Element).tagName === "INPUT";

type Shown = (input: HTMLInputElement) => boolean;

const usable = (input: HTMLInputElement) => !input.disabled && !input.readOnly;
const saysUsername = (input: HTMLInputElement) =>
  saysAutocomplete(input, "username", "email") || input.type === "email";

/** The inputs of the field's form, or of its document when it has none, in document order */
const inputsAround = (field: HTMLInputElement): HTMLInputElement[] => {
  const scope = field.form ?? field.ownerDocument;
  return Array.from(scope.querySelectorAll("input")).filter(
    (input) => input.form === field.form,
  ) as HTMLInputElement[];
};

/** The kinds of login field, each only where the page shows it */
const kinds = (shown: Shown) => ({
  isPassword: (input: HTMLInputElement) =>
    input.type === "password" && usable(input) && shown(input),
  isUserLike: (input: HTMLInputElement) =>
    USER_TYPES.has(input.type) && usable(input) && shown(input),
});

/** The login a focused element belongs to, or undefined for anything else */
export const loginOf = (field: unknown, shown: Shown = fieldShown): Login | undefined => {
  if (!isInput(field)) return undefined;
  const { isPassword, isUserLike } = kinds(shown);
  const inputs = inputsAround(field);
  const at = inputs.indexOf(field);
  if (isPassword(field)) {
    // The user name field: one marked as such, else the last one before the password field
    const before = inputs.slice(0, at).filter(isUserLike);
    const username = before.find(saysUsername) ?? before.at(-1);
    return username ? { username, password: field } : { password: field };
  }
  if (!isUserLike(field)) return undefined;
  const password = inputs.slice(at + 1).find(isPassword);
  if (password) return { username: field, password };
  // A first step that asks only for the user name, as many sign-ins do now
  return saysAutocomplete(field, "username") ? { username: field } : undefined;
};
