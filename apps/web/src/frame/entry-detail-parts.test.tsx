import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { createToasts, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { EntryDetail } from "./entry-detail.tsx";
import type { Saved } from "./entry-detail-parts.tsx";

// K-306 part 5: the star, the tags, why an entry is "Zum Ändern" and its earlier passwords
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const entry = (role: "read" | "edit", favorite = false) =>
  shown({
    idText: "e1",
    vaultIdText: "v1",
    role,
    version: 2,
    content: {
      type: "login",
      title: "Bank",
      fields: [{ id: "password", name: "", value: "neu-geheim", kind: "secret" }],
      tags: ["Buchhaltung", "Bank"],
      favorite,
      history: [{ fieldId: "password", value: "alt-geheim", replacedAt: 1_790_000_000 }],
    },
  });

const shownIn = (found: ShownEntry, onFavorite?: (e: ShownEntry) => Promise<Saved>) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  const toasts = createToasts();
  dispose = render(
    () => (
      <EntryDetail
        nav={{ go: () => {}, path: () => "/" } as never}
        filter={{ kind: "all" }}
        selected="e1"
        toasts={toasts}
        entries={[found]}
        vaultName={() => "Büro"}
        onFavorite={onFavorite}
      />
    ),
    root,
  );
  flush();
  const star = root.querySelector<HTMLButtonElement>('button[aria-label="Favorit"]');
  return { root, star, toasts };
};

describe("entry detail: favorite", () => {
  it("lets who may edit mark the entry, and shows it pressed", async () => {
    const asked: string[] = [];
    const { star } = shownIn(entry("edit"), async (e) => {
      asked.push(e.id);
      return { ok: true, value: e.id };
    });
    expect(star?.disabled).toBe(false);
    expect(star?.getAttribute("aria-pressed")).toBe("false");
    star?.click();
    expect(asked).toEqual(["e1"]);
    dispose();
    expect(shownIn(entry("edit", true)).star?.getAttribute("aria-pressed")).toBe("true");
  });

  it("is greyed out for a reader and on an entry shared with this account", () => {
    const save = async () => ({ ok: true, value: "" }) as const;
    expect(shownIn(entry("read", true), save).star?.disabled).toBe(true);
    dispose();
    expect(shownIn({ ...entry("edit"), sharedBy: "Jonas" }, save).star?.disabled).toBe(true);
  });

  it("says so when the favorite was not saved", async () => {
    const { star, toasts } = shownIn(entry("edit"), async () => ({
      ok: false,
      error: "unreachable",
    }));
    star?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toasts.toasts().map((t) => t.text)).toEqual([
      "Der Favorit wurde nicht gespeichert. Versuch es noch einmal.",
    ]);
  });
});

describe("entry detail: tags, Zum Ändern, earlier passwords", () => {
  it("shows the tags and the earlier password masked, with when it was replaced", () => {
    const { root } = shownIn(entry("edit"));
    const tags = root.querySelector('[aria-label="Tags"]');
    expect(tags?.textContent).toBe("BuchhaltungBank");
    const earlier = root.querySelector('[aria-label="Frühere Passwörter"]');
    expect(earlier?.textContent).toContain("Passwort bis");
    expect(earlier?.textContent).not.toContain("alt-geheim");
    // Its own label, apart from the current password's
    const reveal = earlier?.querySelector<HTMLButtonElement>('button[aria-label$=" aufdecken"]');
    expect(reveal?.getAttribute("aria-label")).toMatch(/^Passwort bis .+ aufdecken$/);
    reveal?.click();
    flush();
    expect(earlier?.textContent).toContain("alt-geheim");
    expect(root.querySelector('[role="note"]')).toBeNull();
  });

  it("says why an entry is Zum Ändern", () => {
    const { root } = shownIn({ ...entry("edit"), weak: true, reused: 3 });
    const note = root.querySelector('[role="note"]');
    expect(note?.textContent).toContain("Das Passwort ist schwach und leicht zu erraten.");
    expect(note?.textContent).toContain("Dasselbe Passwort steht in 3 Einträgen.");
    dispose();
    const reused = shownIn({ ...entry("edit"), reused: 2 }).root.querySelector('[role="note"]');
    expect(reused?.textContent).not.toContain("schwach");
  });

  it("says who left and until when they could read it, and what to change (K-307)", () => {
    const marks = [
      { account: "bWF4", name: "Max", at: Date.UTC(2026, 10, 20) / 1000, fields: ["Passwort"] },
      { account: "YW5uYQ", name: null, at: Date.UTC(2026, 10, 21) / 1000, fields: ["PIN", "Code"] },
    ];
    const { root } = shownIn({ ...entry("edit"), marks });
    const note = root.querySelector('[role="note"]');
    expect(note?.textContent).toContain("Max hatte Zugriff bis 20.11.2026. Ändere: Passwort.");
    expect(note?.textContent).toContain(
      "Ein ehemaliges Mitglied hatte Zugriff bis 21.11.2026. Ändere: PIN, Code.",
    );
    expect(note?.textContent).not.toContain("schwach");
  });
});
