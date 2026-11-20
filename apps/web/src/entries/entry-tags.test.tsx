import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { TagsInput } from "./entry-tags.tsx";

// K-306 part 5: tags in the entry dialog
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const shownWith = (tags: string[]) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  const changes: string[][] = [];
  dispose = render(() => {
    const [now, setNow] = createSignal(tags);
    return (
      <form onSubmit={() => changes.push(["submitted"])}>
        <TagsInput
          tags={now()}
          onChange={(next) => {
            changes.push(next);
            setNow(next);
          }}
        />
      </form>
    );
  }, root);
  flush();
  const input = root.querySelector("input") as HTMLInputElement;
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    // A browser flushes between events
    flush();
  };
  return { root, input, type, changes };
};

describe("tags input", () => {
  it("adds a tag with Enter, without sending the form, and with the button", () => {
    const { root, input, type, changes } = shownWith(["Büro"]);
    type(" Bank ");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    flush();
    expect(changes).toEqual([["Bank", "Büro"]]);
    expect(input.value).toBe("");
    type("Werkstatt");
    [...root.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Tag hinzufügen"))
      ?.click();
    flush();
    expect(changes.at(-1)).toEqual(["Bank", "Büro", "Werkstatt"]);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(changes).toHaveLength(2);
  });

  it("removes a tag with its own button", () => {
    const { root, changes } = shownWith(["Bank", "Büro"]);
    root.querySelector<HTMLButtonElement>('button[aria-label="Tag Bank entfernen"]')?.click();
    flush();
    expect(changes).toEqual([["Büro"]]);
    expect(root.querySelector("ul")?.textContent).toBe("Büro");
  });
});
