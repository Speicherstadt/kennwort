/**
 * Scanning the setup QR code of a one-time code (K-306 part 4b): with the camera, frame by frame,
 * or from a chosen or pasted screenshot; only an otpauth link for TOTP is taken, or what another
 * kind of code accepts (Google Authenticator's export codes, K-503)
 */
import { parseTotp } from "@kennwort/core";
import { Button, buttonClass, Dialog, Icon, m } from "@kennwort/ui";
import { Camera, ImageUp } from "@kennwort/ui/icons";
import { createSignal, onSettled, Show } from "solid-js";
import { readQr } from "./qr.ts";
import { hasCamera, openCamera, pixelsOfImage, pixelsOfVideo } from "./qr-source.ts";

/** The codes a scan takes: which texts, what the dialog says first and when a code is another */
export type QrKind = {
  accepts: (text: string) => boolean;
  intro: () => string;
  wrong: () => string;
};

const TOTP_SETUP: QrKind = {
  accepts: (text) => /^otpauth:/i.test(text.trim()) && parseTotp(text).ok,
  intro: () => m.qr_scan_intro(),
  wrong: () => m.qr_not_totp(),
};

type Problem = "not-found" | "wrong" | "no-camera";
const SCAN_EVERY_MS = 250;

export const QrScanDialog = (props: {
  onFound: (link: string) => void;
  onClose: () => void;
  /** The setup code of a one-time code unless said otherwise */
  kind?: QrKind;
}) => {
  const kind = () => props.kind ?? TOTP_SETUP;
  const problemText = (problem: Problem) =>
    ({ "not-found": m.qr_not_found, wrong: kind().wrong, "no-camera": m.qr_no_camera })[problem]();
  const [problem, setProblem] = createSignal<Problem>();
  const [stream, setStream] = createSignal<MediaStream>();
  // What stop() turns off: the signal gives the old value until the next flush (Solid 2 batching)
  let media: MediaStream | undefined;
  let video: HTMLVideoElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Once the dialog is gone, nothing that was still on its way may act: a camera that opens late
  // is stopped, a frame read late hands on nothing (review of K-306 part 4b)
  let disposed = false;
  const stopTracks = (media: MediaStream | undefined) => {
    for (const track of media?.getTracks() ?? []) track.stop();
  };
  const stop = () => {
    clearTimeout(timer);
    stopTracks(media);
  };
  /** True when the text is a code of the kind and was handed on; anything else says why not */
  const take = (text: string | undefined) => {
    if (disposed || text === undefined) return false;
    if (!kind().accepts(text)) {
      setProblem("wrong");
      return false;
    }
    stop();
    props.onFound(text.trim());
    return true;
  };
  const scanFrame = async () => {
    const pixels = video && pixelsOfVideo(video);
    const text = pixels && (await readQr(pixels));
    if (disposed || take(text)) return;
    timer = setTimeout(() => void scanFrame(), SCAN_EVERY_MS);
  };
  // One camera at a time: a second click while the browser still asks would open another that
  // nothing stops (review of K-306 part 4b); a plain flag, as Solid 2 reads signals late
  let opening = false;
  const [waiting, setWaiting] = createSignal(false);
  const startCamera = async () => {
    if (opening) return;
    opening = true;
    setWaiting(true);
    const opened = await openCamera();
    // Settled either way: after a refusal the next click may ask again (review of K-306 part 4b)
    opening = false;
    setWaiting(false);
    if (disposed) return stopTracks(opened);
    if (!opened) return setProblem("no-camera");
    setProblem(undefined);
    media = opened;
    setStream(opened);
    if (video) {
      video.srcObject = opened;
      await video.play().catch(() => undefined);
    }
    void scanFrame();
  };
  const fromImage = async (file: Blob | undefined) => {
    if (!file) return;
    const pixels = await pixelsOfImage(file);
    const text = pixels && (await readQr(pixels));
    if (disposed) return;
    if (text === undefined) setProblem("not-found");
    else take(text);
  };
  const onPaste = (event: ClipboardEvent) => {
    const image = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (image) void fromImage(image);
  };
  // On the whole page while the dialog is open: right after it opens, the focus is on its header
  onSettled(() => {
    document.addEventListener("paste", onPaste);
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("paste", onPaste);
    };
  });
  return (
    <Dialog open onClose={props.onClose} title={m.qr_scan()}>
      <div class="grid gap-3 p-4 pt-2">
        <p class="text-[13px] text-muted-foreground">{kind().intro()}</p>
        <video
          ref={(el) => {
            video = el;
          }}
          class={stream() ? "aspect-square w-full rounded-lg bg-muted object-cover" : "hidden"}
          muted
          playsinline
        />
        <div class="flex flex-wrap gap-2">
          <Show when={hasCamera() && !stream()}>
            <Button type="button" disabled={waiting()} onClick={() => void startCamera()}>
              <Icon icon={Camera} /> {m.qr_camera()}
            </Button>
          </Show>
          <label class={buttonClass({})}>
            <Icon icon={ImageUp} /> {m.qr_image()}
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              onChange={(event) => void fromImage(event.currentTarget.files?.[0])}
            />
          </label>
        </div>
        <Show when={problem()}>
          {(p) => (
            <p
              class="rounded-lg border border-danger px-3 py-2 text-[13px] text-danger"
              role="alert"
            >
              {problemText(p())}
            </p>
          )}
        </Show>
      </div>
    </Dialog>
  );
};
