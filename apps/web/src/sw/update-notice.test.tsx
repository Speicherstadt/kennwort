import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { UpdateNotice } from "./update-notice.tsx";

describe("UpdateNotice", () => {
  it("shows nothing until a verified version waits, then offers to reload", async () => {
    setLocale("de", { reload: false });
    const root = document.createElement("div");
    const [ready, setReady] = createSignal(false);
    const onReload = vi.fn();
    const dispose = render(() => <UpdateNotice ready={ready()} onReload={onReload} />, root);
    expect(root.querySelector('[role="status"]')?.textContent).toBe("");
    setReady(true);
    await Promise.resolve();
    expect(root.textContent).toContain("Neue Version bereit");
    root.querySelector("button")?.click();
    expect(onReload).toHaveBeenCalledOnce();
    dispose();
  });
});
