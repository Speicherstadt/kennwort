import { createToasts, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { shown } from "../entries/entries.ts";
import { EntryDetail } from "./entry-detail.tsx";

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

describe("review: entry detail", () => {
  it("does not show a TOTP seed another app stored in clear before it is revealed", () => {
    setLocale("de", { reload: false });
    const entry = shown({
      idText: "e1",
      vaultIdText: "v1",
      content: {
        type: "login",
        title: "Bank",
        fields: [
          { id: "username", name: "Username", value: "jonas", kind: "text" },
          { id: "password", name: "Password", value: "pw-geheim", kind: "secret" },
          {
            id: "x-totp",
            name: "One-time code",
            value: "otpauth://totp/Bank:jonas?secret=JBSWY3DPEHPK3PXP",
            kind: "totp",
          },
        ],
        tags: [],
        favorite: false,
        history: [],
      },
    } as never);
    const root = document.createElement("div");
    document.body.append(root);
    const nav = { go: () => {}, path: () => "/" } as never;
    dispose = render(
      () => (
        <EntryDetail
          nav={nav}
          filter={{ kind: "all" } as never}
          selected="e1"
          toasts={createToasts()}
          entries={[entry]}
          vaultName={() => "Tresor"}
        />
      ),
      root,
    );
    flush();
    expect(root.textContent).toContain("jonas");
    expect(root.textContent).not.toContain("pw-geheim");
    expect(root.textContent).not.toContain("JBSWY3DPEHPK3PXP");
  });
});
