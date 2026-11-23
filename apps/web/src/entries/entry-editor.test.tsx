import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type EditorVault, EntryEditor } from "./entry-editor.tsx";
import { newInput } from "./entry-input.ts";

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

describe("EntryEditor", () => {
  it("offers the first vault even when the vaults load after the dialog opened", async () => {
    setLocale("de", { reload: false });
    const [vaults, setVaults] = createSignal<EditorVault[]>([]);
    const onSave = vi.fn(async () => ({ ok: true as const, value: "e-1" }));
    const root = document.createElement("div");
    document.body.append(root);
    dispose = render(
      () => (
        <EntryEditor
          title="Neuer Eintrag"
          initial={{ ...newInput("login"), title: "DATEV" }}
          vaults={vaults()}
          onSave={onSave}
          onClose={() => {}}
        />
      ),
      root,
    );
    flush();
    setVaults([
      { idText: "v-office", name: "Büro" },
      { idText: "v-books", name: "Buchhaltung" },
    ]);
    flush();
    const select = root.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("v-office");
    root.querySelector("form")?.requestSubmit();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "DATEV" }), "v-office");
  });
});

describe("EntryEditor inline", () => {
  type Check = (proceed: () => void) => boolean;
  const mount = () => {
    setLocale("de", { reload: false });
    const onClose = vi.fn();
    const onSave = vi.fn(async () => ({ ok: true as const, value: "e-1" }));
    let check: Check = () => false;
    const release = vi.fn();
    const root = document.createElement("div");
    document.body.append(root);
    dispose = render(
      () => (
        <EntryEditor
          title="Eintrag bearbeiten"
          initial={{ ...newInput("login"), title: "Sparkasse" }}
          onSave={onSave}
          onClose={onClose}
          guard={(next) => {
            check = next;
            return release;
          }}
        />
      ),
      root,
    );
    flush();
    const form = root.querySelector("form") as HTMLFormElement;
    const title = root.querySelector("input") as HTMLInputElement;
    const type = (value: string) => {
      title.value = value;
      title.dispatchEvent(new InputEvent("input", { bubbles: true }));
      flush();
    };
    const key = (init: KeyboardEventInit) => {
      title.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
      flush();
    };
    const button = (name: string) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
    return { form, type, key, button, onClose, onSave, release, check: () => check };
  };

  it("is a form in the pane named by its title, not a dialog", () => {
    const { form } = mount();
    expect(form.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(form.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Eintrag bearbeiten",
    );
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("closes on Esc at once while nothing changed", () => {
    const { key, onClose } = mount();
    key({ key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(undefined);
  });

  it("asks before throwing changes away, and keeps editing on „Weiter bearbeiten“", () => {
    const { type, key, button, onClose } = mount();
    type("Sparkasse Nord");
    key({ key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open]")?.textContent).toContain("Änderungen verwerfen?");
    button("Weiter bearbeiten")?.click();
    flush();
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    button("Abbrechen")?.click();
    flush();
    button("Verwerfen")?.click();
    flush();
    expect(onClose).toHaveBeenCalledWith(undefined);
  });

  it("holds a link back while changed and lets it pass after „Verwerfen“", () => {
    const { type, button, onClose, release, check } = mount();
    const proceed = vi.fn();
    type("Sparkasse Nord");
    expect(check()(proceed)).toBe(true);
    flush();
    expect(proceed).not.toHaveBeenCalled();
    button("Verwerfen")?.click();
    flush();
    expect(release).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(proceed).toHaveBeenCalledOnce();
  });

  it("lets a link pass and closes when nothing changed", () => {
    const { onClose, check } = mount();
    const proceed = vi.fn();
    expect(check()(proceed)).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("saves on Ctrl+Enter", async () => {
    const { key, onSave } = mount();
    key({ key: "Enter", ctrlKey: true });
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Sparkasse" }), undefined);
  });
});
