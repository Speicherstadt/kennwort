import { createToasts, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { type ShownEntry, shown } from "../entries/entries.ts";
import { EntryDetail } from "./entry-detail.tsx";

// K-305 part 6b (P-10): "Teilen" works for who may edit the entry's vault, never for a reader or
// on an entry someone shared with this account, which says who shared it instead of its vault
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

const shownIn = (found: ShownEntry, onShare: (e: ShownEntry) => void) => {
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
        onShare={onShare}
      />
    ),
    root,
  );
  flush();
  const button = [...root.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Teilen"),
  );
  return { root, button };
};

describe("entry detail: sharing", () => {
  it("opens sharing for an entry of a vault this account may edit", () => {
    const asked: string[] = [];
    const { button } = shownIn(entry("edit"), (e) => asked.push(e.id));
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(asked).toEqual(["e1"]);
  });

  it("offers no sharing to a reader of the vault", () => {
    expect(shownIn(entry("read"), () => {}).button?.disabled).toBe(true);
  });

  it("shows who shared an entry with this account, without its vault or sharing", () => {
    const { root, button } = shownIn({ ...entry("edit"), sharedBy: "Jonas" }, () => {});
    expect(root.textContent).toContain("Geteilt von Jonas");
    expect(root.textContent).not.toContain("Büro");
    expect(button?.disabled).toBe(true);
  });
});
