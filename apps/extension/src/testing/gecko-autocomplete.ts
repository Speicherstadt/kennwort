import { vi } from "vitest";

/**
 * Makes `input.autocomplete` answer as Firefox does by default: "on" or "off" when the attribute
 * says so, else "". Gecko serialises a field name such as `username` or `new-password` only while
 * the pref dom.forms.autocomplete.formautofill is on, and it is off by default
 * (nsContentUtils::InternalSerializeAutocompleteAttribute and StaticPrefList.yaml in
 * mozilla-firefox/firefox). Undone by vi.restoreAllMocks().
 */
export const geckoAutocomplete = () =>
  vi.spyOn(HTMLInputElement.prototype, "autocomplete", "get").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    const value = (this.getAttribute("autocomplete") ?? "").trim().toLowerCase();
    return value === "on" || value === "off" ? value : "";
  });
