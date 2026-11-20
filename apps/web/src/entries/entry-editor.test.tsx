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
