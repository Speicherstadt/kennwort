import type { FillRequest, FillResponse } from "@kennwort/client/autofill/bridge.ts";
import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { NativeAutofill } from "./autofill-native.ts";
import { AutofillSheet } from "./autofill-sheet.tsx";

// K-802: nothing is filled until a matching entry is tapped; closing answers with a cancel
beforeAll(() => {
  // happy-dom's <dialog> lacks showModal in some versions; the Dialog only needs it to exist
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
});

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  setLocale("de", { reload: false });
});

const request: FillRequest = {
  version: 1,
  requestId: "r-1",
  target: { kind: "web", host: "portal.weber-haustechnik.test" },
  fields: ["username", "password"],
};

const entry = (id: string, url: string) =>
  ({
    id,
    type: "login",
    title: id,
    username: `${id}@weber-haustechnik.test`,
    password: `pw-${id}`,
    fields: [{ id: "website", label: "", value: url, kind: "url" }],
  }) as unknown as ShownEntry;

const entries = [
  entry("Portal", "https://portal.weber-haustechnik.test"),
  entry("Elsewhere", "https://weber-haustechnik.test"),
];

const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  flush();
};

const mount = async (pending: FillRequest | undefined) => {
  const responses: FillResponse[] = [];
  const native: NativeAutofill = {
    pending: vi.fn(async () => pending),
    respond: vi.fn(async (response: FillResponse) => {
      responses.push(response);
    }),
    takeSave: vi.fn(async () => undefined),
  };
  const onSave = vi.fn();
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => <AutofillSheet native={native} entries={() => entries} onSave={onSave} />,
    root,
  );
  await settle();
  return { root, responses, onSave };
};

const buttons = (root: HTMLElement) => [...root.querySelectorAll("button")];

it("lists only the entries for the exact host and fills nothing before a tap", async () => {
  const { root, responses } = await mount(request);
  const labels = buttons(root).map((b) => b.textContent ?? "");
  expect(labels.some((l) => l.includes("Portal"))).toBe(true);
  expect(labels.some((l) => l.includes("Elsewhere"))).toBe(false);
  expect(responses).toEqual([]);
});

it("answers with the tapped entry's username and password", async () => {
  const { root, responses } = await mount(request);
  buttons(root)
    .find((b) => b.textContent?.includes("Portal"))
    ?.click();
  await settle();
  expect(responses).toEqual([
    {
      version: 1,
      requestId: "r-1",
      kind: "fill",
      values: { username: "Portal@weber-haustechnik.test", password: "pw-Portal" },
    },
  ]);
});

it("answers with a cancel when the person declines", async () => {
  const { root, responses } = await mount(request);
  buttons(root)
    .find((b) => b.textContent === "Nicht ausfüllen")
    ?.click();
  await settle();
  expect(responses).toEqual([{ version: 1, requestId: "r-1", kind: "cancel" }]);
});

it("shows nothing without a pending request", async () => {
  const { root } = await mount(undefined);
  expect(root.querySelector("dialog")).toBeNull();
});
