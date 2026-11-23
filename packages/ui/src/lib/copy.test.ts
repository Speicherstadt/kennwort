import { describe, expect, it, vi } from "vitest";
import type { Toasts } from "../components/toast.tsx";
import { m } from "../paraglide/messages.js";
import {
  browserClipboard,
  CLEAR_AFTER_MS,
  copyText,
  detectClipboard,
  nativeClipboard,
} from "./copy.ts";

const fakeClipboard = (initial = "") => {
  let content = initial;
  return {
    writeText: vi.fn(async (text: string) => {
      content = text;
    }),
    readText: vi.fn(async () => content),
    current: () => content,
  };
};

const manualSchedule = () => {
  const jobs: { run: () => void; ms: number }[] = [];
  return { jobs, schedule: (run: () => void, ms: number) => jobs.push({ run, ms }) };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("browserClipboard", () => {
  it("clears the clipboard after 30 s when it still holds our value", async () => {
    const clipboard = fakeClipboard();
    const { jobs, schedule } = manualSchedule();
    await browserClipboard(clipboard, schedule).copySecret("geheim");
    expect(clipboard.current()).toBe("geheim");
    expect(jobs.map((job) => job.ms)).toEqual([CLEAR_AFTER_MS]);
    expect(CLEAR_AFTER_MS).toBe(30_000);
    jobs[0]?.run();
    await settle();
    expect(clipboard.current()).toBe("");
  });

  it("leaves something the person copied since alone", async () => {
    const clipboard = fakeClipboard();
    const { jobs, schedule } = manualSchedule();
    await browserClipboard(clipboard, schedule).copySecret("geheim");
    await clipboard.writeText("Einkaufsliste");
    jobs[0]?.run();
    await settle();
    expect(clipboard.current()).toBe("Einkaufsliste");
  });

  it("does not clear blind when reading the clipboard is denied", async () => {
    const clipboard = fakeClipboard();
    clipboard.readText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { jobs, schedule } = manualSchedule();
    await browserClipboard(clipboard, schedule).copySecret("geheim");
    jobs[0]?.run();
    await settle();
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });
});

describe("detectClipboard", () => {
  it("copies through the app's native command when Tauri is there", async () => {
    const invoke = vi.fn(async () => undefined);
    await detectClipboard({ __TAURI_INTERNALS__: { invoke } }).copySecret("geheim");
    expect(invoke).toHaveBeenCalledWith("copy_secret", { text: "geheim" });
  });

  it("falls back to the browser's clipboard when the native command fails", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText, readText: async () => "" },
      configurable: true,
    });
    const invoke = vi.fn(async () => Promise.reject(new Error("no plugin")));
    await detectClipboard({ __TAURI_INTERNALS__: { invoke } }).copySecret("geheim");
    expect(writeText).toHaveBeenCalledWith("geheim");
  });

  it("never calls native code in a browser", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText, readText: async () => "" },
      configurable: true,
    });
    await detectClipboard({}).copySecret("geheim");
    expect(writeText).toHaveBeenCalledWith("geheim");
  });
});

describe("copyText", () => {
  const toasts = () =>
    ({ show: vi.fn() }) as unknown as Toasts & { show: ReturnType<typeof vi.fn> };

  it("names what was copied", async () => {
    const t = toasts();
    await copyText(
      "geheim",
      "Passwort",
      t,
      nativeClipboard(async () => undefined),
    );
    expect(t.show).toHaveBeenCalledWith(m.field_copied({ field: "Passwort" }), "success");
  });

  it("stays quiet when copying fails", async () => {
    const t = toasts();
    await copyText(
      "geheim",
      "Passwort",
      t,
      nativeClipboard(async () => Promise.reject(new Error("x"))),
    );
    expect(t.show).not.toHaveBeenCalled();
  });
});
