import { createToasts, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TotpField } from "./totp-field.tsx";

// K-306 part 4: the detail shows one-time codes, never the key
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

// RFC 6238 Appendix B: the 20 ASCII digits in Base32; at 59 s the 8-digit code is 94287082
const RFC = "otpauth://totp/RFC?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8";

const show = (value: string, now: () => number) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  const toasts = createToasts();
  dispose = render(
    () => <TotpField label="Einmalcode" value={value} toasts={toasts} now={now} />,
    root,
  );
  flush();
  return { root, toasts };
};

describe("TotpField", () => {
  it("shows the code in two groups and the seconds it still holds, then the next one", () => {
    vi.useFakeTimers();
    let time = 58_000;
    const { root } = show(RFC, () => time);
    expect(root.textContent).toContain("9428 7082");
    expect(root.textContent).toContain("noch 2 s");
    time = 60_000;
    vi.advanceTimersByTime(1000);
    flush();
    expect(root.textContent).not.toContain("9428 7082");
    expect(root.textContent).toContain("noch 30 s");
  });

  it("never shows the key, and says so when the key makes no codes", () => {
    const { root } = show(RFC, () => 59_000);
    expect(root.textContent).not.toContain("GEZDGNBV");
    const broken = show("kein schlüssel", () => 59_000).root;
    expect(broken.textContent).toContain("Kein gültiger Schlüssel für Einmalcodes");
    expect(broken.querySelector("button")).toBeNull();
  });

  it("copies the code, not the key", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { root, toasts } = show(RFC, () => 59_000);
    (root.querySelector('button[aria-label="Einmalcode kopieren"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(toasts.toasts()).toHaveLength(1));
    expect(writeText).toHaveBeenCalledWith("94287082");
    expect(toasts.toasts().map((t) => t.text)).toContain("Einmalcode kopiert");
  });
});
