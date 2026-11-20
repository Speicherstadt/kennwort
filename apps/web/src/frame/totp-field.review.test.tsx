import { totpCode } from "@kennwort/core";
import { createToasts, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { TotpField } from "./totp-field.tsx";

const RFC = "otpauth://totp/RFC?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8";
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

it("copies the code valid at the moment of the click, not the one of the last tick", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(59_999); // the code 94287082 holds for 1 ms more
  setLocale("de", { reload: false });
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const root = document.createElement("div");
  document.body.append(root);
  const toasts = createToasts();
  dispose = render(() => <TotpField label="Einmalcode" value={RFC} toasts={toasts} />, root);
  flush();
  vi.setSystemTime(60_500); // a new step began 500 ms ago; no tick of the interval yet
  (root.querySelector('button[aria-label="Einmalcode kopieren"]') as HTMLButtonElement).click();
  const now = totpCode(RFC, Date.now());
  expect(now.ok && now.value.code).not.toBe("94287082");
  expect(writeText).toHaveBeenCalledWith(now.ok ? now.value.code : "");
});

it("shows the new code when the step changes, not up to a second later", () => {
  vi.useFakeTimers();
  vi.setSystemTime(59_999);
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => <TotpField label="Einmalcode" value={RFC} toasts={createToasts()} />,
    root,
  );
  flush();
  expect(root.textContent).toContain("9428 7082");
  vi.advanceTimersByTime(1); // 60.000 s: the code of step 1 no longer holds
  flush();
  expect(root.textContent).not.toContain("9428 7082");
});
