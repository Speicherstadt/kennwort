import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush, Show } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

// Third review of K-306 part 4b: a refused camera can be tried again
const source = vi.hoisted(() => ({
  openCamera: vi.fn<() => Promise<MediaStream | undefined>>(),
  pixelsOfVideo: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
}));
const qr = vi.hoisted(() => ({ readQr: vi.fn<() => Promise<string | undefined>>() }));
vi.mock("./qr-source.ts", () => ({
  hasCamera: () => true,
  openCamera: source.openCamera,
  pixelsOfVideo: source.pixelsOfVideo,
  pixelsOfImage: vi.fn(),
}));
vi.mock("./qr.ts", () => ({ readQr: qr.readQr }));
const { QrScanDialog } = await import("./qr-scan-dialog.tsx");

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const fakeStream = () => {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
};

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.clearAllMocks();
});

const show = () => {
  setLocale("de", { reload: false });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  // happy-dom only takes its own MediaStream; a plain slot stands in for the browser's
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() {
      return (this as { _src?: unknown })._src ?? null;
    },
    set(value: unknown) {
      (this as { _src?: unknown })._src = value;
    },
  });
  const root = document.createElement("div");
  document.body.append(root);
  const [open, setOpen] = createSignal(true);
  const onFound = vi.fn();
  dispose = render(
    () => (
      <Show when={open()}>
        <QrScanDialog onFound={onFound} onClose={() => setOpen(false)} />
      </Show>
    ),
    root,
  );
  flush();
  const close = () => {
    setOpen(false);
    flush();
  };
  const cameraButton = () =>
    [...root.querySelectorAll("button")].find((b) => b.textContent?.includes("Kamera")) as
      | HTMLButtonElement
      | undefined;
  return { root, close, onFound, cameraButton };
};

describe("QrScanDialog (third review)", () => {
  it("opens the camera on a second try after the first was refused", async () => {
    const { stream } = fakeStream();
    source.openCamera.mockResolvedValueOnce(undefined).mockResolvedValueOnce(stream);
    qr.readQr.mockResolvedValue(undefined);
    const { root, cameraButton } = show();
    cameraButton()?.click();
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
    flush();
    expect(cameraButton()?.disabled).toBe(false);
    cameraButton()?.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(source.openCamera).toHaveBeenCalledTimes(2);
  });
});
