import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeBytes } from "@kennwort/core";
import { formatSecretKey } from "@kennwort/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type Device,
  devicePath,
  readDevice,
  removeDevice,
  statePath,
  writeDevice,
} from "./device-file.ts";

const device: Device = {
  server: "https://kennwort.weber-haustechnik.test",
  accountId: new Uint8Array(16).fill(7),
  secretKey: new Uint8Array(16).fill(9),
  deviceId: new Uint8Array(16).fill(3),
};

let home: string;
let path: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "kennwort-cli-"));
  path = devicePath({ XDG_CONFIG_HOME: join(home, "config") }, home);
});

describe("where the device is kept", () => {
  it("lives under XDG_CONFIG_HOME, else under ~/.config", () => {
    expect(devicePath({ XDG_CONFIG_HOME: "/x/config" }, "/home/jonas")).toBe(
      "/x/config/kennwort/device.json",
    );
    expect(devicePath({}, "/home/jonas")).toBe("/home/jonas/.config/kennwort/device.json");
  });

  it("ignores a relative XDG_CONFIG_HOME, as the XDG spec says", () => {
    expect(devicePath({ XDG_CONFIG_HOME: "config" }, "/home/jonas")).toBe(
      "/home/jonas/.config/kennwort/device.json",
    );
  });
});

describe("the device file", () => {
  it("is written for the owner only (0600, folder 0700) and read back", () => {
    expect(writeDevice(path, device)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, "config", "kennwort")).mode & 0o777).toBe(0o700);
    expect(readDevice(path)).toEqual({ ok: true, value: device });
  });

  it("holds the server, the account ID, the Secret Key and the device ID, nothing else", () => {
    writeDevice(path, device);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 1,
      server: device.server,
      accountId: encodeBytes(device.accountId),
      secretKey: formatSecretKey(device.secretKey),
      deviceId: encodeBytes(device.deviceId),
    });
  });

  it("is replaced as a whole and stays 0600 when it was looser before", () => {
    writeDevice(path, device);
    chmodSync(path, 0o644);
    writeDevice(path, { ...device, server: "https://other.test" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const read = readDevice(path);
    expect(read.ok && read.value?.server).toBe("https://other.test");
  });

  it("is nothing when there is none", () => {
    expect(readDevice(path)).toEqual({ ok: true, value: undefined });
  });

  it("is refused when others may read it, as ssh refuses a private key", () => {
    writeDevice(path, device);
    chmodSync(path, 0o640);
    expect(readDevice(path)).toEqual({ ok: false, error: "insecure-device-file" });
  });

  it.each([
    "not json",
    "{}",
    JSON.stringify({ version: 2, server: device.server }),
    JSON.stringify({
      version: 1,
      server: "http://kennwort.weber-haustechnik.test",
      accountId: encodeBytes(device.accountId),
      secretKey: formatSecretKey(device.secretKey),
      deviceId: encodeBytes(device.deviceId),
    }),
    JSON.stringify({
      version: 1,
      server: device.server,
      accountId: "short",
      secretKey: formatSecretKey(device.secretKey),
      deviceId: encodeBytes(device.deviceId),
    }),
    JSON.stringify({
      version: 1,
      server: device.server,
      accountId: encodeBytes(device.accountId),
      secretKey: "A3-XXXX",
      deviceId: encodeBytes(device.deviceId),
    }),
  ])("is damaged when it holds %s", (text) => {
    writeDevice(path, device);
    writeFileSync(path, text, { mode: 0o600 });
    expect(readDevice(path)).toEqual({ ok: false, error: "damaged-device-file" });
  });

  it("is removed on logout with the account state beside it, and removing none is fine", () => {
    writeDevice(path, device);
    writeFileSync(statePath(path), "{}", { mode: 0o600 });
    expect(statePath(path)).toBe(join(home, "config", "kennwort", "state.json"));
    expect(removeDevice(path)).toBe(true);
    expect(readDevice(path)).toEqual({ ok: true, value: undefined });
    expect(existsSync(statePath(path))).toBe(false);
    expect(removeDevice(path)).toBe(true);
  });
});
