/**
 * The autofill tokens a page gives an input in its `autocomplete` attribute (K-407), read from the
 * attribute itself: Firefox's `input.autocomplete` answers only "on" or "off" while the pref
 * dom.forms.autocomplete.formautofill is off, its default, and "" for `username`,
 * `current-password` or `new-password` (nsContentUtils::InternalSerializeAutocompleteAttribute
 * and StaticPrefList.yaml in mozilla-firefox/firefox). Tokens are ASCII case-insensitive (HTML).
 */
export const autocompleteTokens = (input: Element): string[] =>
  (input.getAttribute("autocomplete") ?? "").toLowerCase().split(/\s+/).filter(Boolean);

/** Whether the attribute names any of these field names */
export const saysAutocomplete = (input: Element, ...names: string[]) =>
  autocompleteTokens(input).some((token) => names.includes(token));
