import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./app.tsx";

describe("App", () => {
  let dispose = () => {};
  afterEach(() => {
    dispose();
    document.body.innerHTML = "";
  });

  const mount = () => {
    const root = document.createElement("div");
    document.body.append(root);
    dispose = render(() => <App />, root);
    return root;
  };

  it("shows the German texts by default", () => {
    setLocale("de", { reload: false });
    expect(mount().querySelector("h1")?.textContent).toBe("Kennwort");
    expect(document.body.textContent).toContain("nur für euch lesbar");
  });

  it("shows the English texts after switching the locale", () => {
    setLocale("en", { reload: false });
    expect(document.body.textContent).not.toContain("readable only by you");
    mount();
    expect(document.body.textContent).toContain("readable only by you");
  });
});
