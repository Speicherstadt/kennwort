/**
 * Writes a login into its fields (K-403) the way typing would show it to the page's scripts: the
 * value through the input's own setter, then input and change events, so frameworks that track
 * the value (React and others) see it. Runs in the content script's isolated world, whose
 * prototypes the page cannot replace.
 */
import type { Login } from "./login-fields.ts";

const setValue = (input: HTMLInputElement, value: string) => {
  const view = input.ownerDocument.defaultView;
  const setter = view && Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value");
  if (setter?.set) setter.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

/** Fills what the login has fields for; false when none of them is on the page any more */
export const fillLogin = (login: Login, values: { username: string; password: string }) => {
  const username = login.username?.isConnected ? login.username : undefined;
  const password = login.password?.isConnected ? login.password : undefined;
  if (!username && !password) return false;
  if (username && values.username !== "") setValue(username, values.username);
  if (password) setValue(password, values.password);
  return true;
};
