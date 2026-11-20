import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { OfflineNotice } from "./offline-notice.tsx";

let dispose = () => {};
afterEach(() => dispose());

const shown = (offline: boolean, syncedAt: number | undefined) => {
  const root = document.createElement("div");
  const [state, setState] = createSignal({ offline, syncedAt });
  dispose = render(
    () => <OfflineNotice offline={state().offline} syncedAt={state().syncedAt} />,
    root,
  );
  flush();
  return { root, setState };
};

describe("OfflineNotice", () => {
  it("says nothing while the server answers", () => {
    setLocale("de", { reload: false });
    const { root } = shown(false, 1_700_000_000_000);
    expect(root.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("says offline, read only, and when the device last synced", () => {
    setLocale("de", { reload: false });
    const { root, setState } = shown(true, Date.UTC(2026, 10, 20, 13, 5));
    const text = root.textContent ?? "";
    expect(text).toContain("Offline – nur lesen");
    expect(text).toContain("Letzter Abgleich: ");
    expect(text).toContain("20.11.2026");
    setState({ offline: false, syncedAt: undefined });
    flush();
    expect(root.textContent).toBe("");
  });

  it("says so in English, and when there was no sync yet", () => {
    setLocale("en", { reload: false });
    const { root } = shown(true, undefined);
    expect(root.textContent).toContain("Offline – read only");
    expect(root.textContent).toContain("No sync on this device yet");
    setLocale("de", { reload: false });
  });
});
