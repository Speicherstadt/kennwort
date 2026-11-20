import { describe, expect, it } from "vitest";
import { deviceId, deviceIdentity, deviceName } from "./device-identity.ts";

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("deviceId", () => {
  it("is made once and kept", () => {
    const storage = memory();
    const first = deviceId(storage, (n) => new Uint8Array(n).fill(1));
    expect(first).toBe("AQEBAQEBAQEBAQEBAQEBAQ");
    expect(deviceId(storage, (n) => new Uint8Array(n).fill(2))).toBe(first);
  });

  it("replaces a kept value that is not an ID, and works without storage", () => {
    const storage = memory();
    storage.data.set("kennwort-device-id", "kaputt");
    expect(deviceId(storage, (n) => new Uint8Array(n).fill(3))).toBe("AwMDAwMDAwMDAwMDAwMDAw");
    expect(storage.data.get("kennwort-device-id")).toBe("AwMDAwMDAwMDAwMDAwMDAw");
    expect(deviceId(throwing, (n) => new Uint8Array(n).fill(4))).toBe("BAQEBAQEBAQEBAQEBAQEBA");
    expect(deviceId(undefined, (n) => new Uint8Array(n).fill(4))).toBe("BAQEBAQEBAQEBAQEBAQEBA");
  });
});

describe("deviceName", () => {
  it.each([
    ["Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", "Firefox · Linux"],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
      "Edge · Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 OPR/120.0",
      "Opera · Windows",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
      "Chrome · Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1",
      "Safari · iPhone",
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
      "Safari · iPad",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15",
      "Safari · macOS",
    ],
    [
      "Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      "Chrome · ChromeOS",
    ],
    ["curl/8.0", "Browser"],
    ["SomeBrowser (Windows)", "Windows"],
  ])("names %s as %s", (userAgent, name) => {
    expect(deviceName(userAgent)).toBe(name);
  });

  it("goes with the ID into the identity", () => {
    const storage = memory();
    const identity = deviceIdentity(storage, "Firefox/1 Linux");
    expect(identity.name).toBe("Firefox · Linux");
    expect(identity.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
