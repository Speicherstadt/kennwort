import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { createToasts, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { EntryDetail } from "./entry-detail.tsx";

// K-601: „Einmal-Link“ works for who may edit the entry's vault, as „Teilen“ does: never for a
// reader, and never on an entry someone shared with this account
// happy-dom has no Popover API; Playwright checks the real one. „Teilen“ and „Einmal-Link“ sit in
// the ⋯ menu, which hides itself when an item is chosen
HTMLElement.prototype.showPopover ??= function (this: HTMLElement) {
  this.dataset.open = "";
};
HTMLElement.prototype.hidePopover ??= function (this: HTMLElement) {
  delete this.dataset.open;
};

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const entry = (role: "read" | "edit") =>
  shown({
    idText: "e1",
    vaultIdText: "v1",
    role,
    version: 1,
    content: { type: "login", title: "Bank", fields: [], tags: [], favorite: false, history: [] },
  });

const linkButton = (found: ShownEntry, onLink?: (e: ShownEntry) => void) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  const nav = { go: () => {}, path: () => "/" } as never;
  dispose = render(
    () => (
      <EntryDetail
        nav={nav}
        filter={{ kind: "all" }}
        selected="e1"
        toasts={createToasts()}
        entries={[found]}
        vaultName={() => "Büro"}
        onLink={onLink}
      />
    ),
    root,
  );
  flush();
  return [...root.querySelectorAll("button")].find((b) => b.textContent?.includes("Einmal-Link"));
};

/** Opens the ⋯ menu as a person does, before choosing an item in it */
const openMore = () => {
  const more = document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
  expect(more).not.toBeNull();
  more?.click();
  document.getElementById(more?.getAttribute("popovertarget") ?? "")?.showPopover();
};

describe("entry detail: one-time link", () => {
  it("opens the link dialog for an entry of a vault this account may edit", () => {
    const asked: string[] = [];
    const button = linkButton(entry("edit"), (e) => asked.push(e.id));
    expect(button?.disabled).toBe(false);
    openMore();
    button?.click();
    expect(asked).toEqual(["e1"]);
  });

  it("offers none to a reader, on an entry shared with this account, or offline", () => {
    expect(linkButton(entry("read"), () => {})?.disabled).toBe(true);
    expect(linkButton({ ...entry("edit"), sharedBy: "Jonas" }, () => {})?.disabled).toBe(true);
    expect(linkButton(entry("edit"))?.disabled).toBe(true);
  });
});
