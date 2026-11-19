import { getLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = getLocale();
  render(() => <App />, root);
}
