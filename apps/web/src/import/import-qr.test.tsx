import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import google from "../../../../packages/core/src/import/fixtures/google-authenticator.txt?raw";

// K-503: the QR step scans Google Authenticator's export codes one after another and hands all
// links on; a setup code of one account is no export code
const qr = vi.hoisted(() => ({ readQr: vi.fn<() => Promise<string | undefined>>() }));
vi.mock("../qr/qr-source.ts", () => ({
  hasCamera: () => false,
  openCamera: vi.fn(),
  pixelsOfVideo: vi.fn(),
  pixelsOfImage: vi.fn(async () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
}));
vi.mock("../qr/qr.ts", () => ({ readQr: qr.readQr }));
const { QrStep } = await import("./import-qr.tsx");
const { vendorChoices } = await import("./vendors.ts");

const [first = "", second = ""] = google.trim().split("\n");

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
  }
};

const show = () => {
  setLocale("de", { reload: false });
  const choice = vendorChoices().find((c) => c.id === "google-authenticator");
  if (!choice) throw new Error("no choice");
  const root = document.createElement("div");
  document.body.append(root);
  const onLinks = vi.fn();
  dispose = render(
    () => (
      <QrStep choice={choice} busy={false} error={undefined} onLinks={onLinks} onBack={() => {}} />
    ),
    root,
  );
  flush();
  return { root, onLinks };
};

const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
};

/** Opens the scan dialog and reads an image whose QR code holds this text */
const scan = async (text: string) => {
  qr.readQr.mockResolvedValueOnce(text);
  button("QR-Code scannen").click();
  flush();
  const input = document.querySelector<HTMLInputElement>('dialog input[type="file"]');
  if (!input) throw new Error("no image input");
  Object.defineProperty(input, "files", {
    value: [new File(["png"], "qr.png")],
    configurable: true,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
};

const status = (root: ParentNode) => root.querySelector('[role="status"]')?.textContent;

describe("QrStep", () => {
  it("counts the export codes as they are scanned and hands them all on", async () => {
    const { root, onLinks } = show();
    expect(document.querySelector("dialog")).toBeNull();
    await scan(first);
    expect(document.querySelector("dialog")).toBeNull();
    expect(status(root)).toBe("1 von 2 QR-Codes gelesen");
    // The same code again changes nothing
    await scan(first);
    expect(status(root)).toBe("1 von 2 QR-Codes gelesen");
    await scan(second);
    expect(status(root)).toBe("2 von 2 QR-Codes gelesen");
    button("Weiter").click();
    flush();
    expect(onLinks).toHaveBeenCalledWith(`${first}\n${second}\n`);
  });

  it("refuses a setup code of one account and keeps the dialog open", async () => {
    const { root } = show();
    await scan("otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP");
    expect(document.querySelector("dialog [role='alert']")?.textContent).toBe(
      "Dieser QR-Code ist kein Export von Google Authenticator.",
    );
    expect(document.querySelector("dialog")?.textContent).toContain(
      "Halte den Export-QR-Code von Google Authenticator vor die Kamera",
    );
    expect(status(root)).toBe("Noch kein QR-Code gelesen.");
  });
});
