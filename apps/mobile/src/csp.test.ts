import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appPolicy } from "@kennwort/core/headers";
import { describe, expect, it } from "vitest";
import { parsePolicy, weakerThan } from "./csp.ts";

type Security = {
  csp?: string;
  devCsp?: string;
  freezePrototype?: boolean;
  dangerousDisableAssetCspModification?: unknown;
};
type TauriConfig = {
  app: { withGlobalTauri?: boolean; windows: { useHttpsScheme?: boolean }[]; security: Security };
};
const config = JSON.parse(
  readFileSync(join(import.meta.dirname, "../src-tauri/tauri.conf.json"), "utf8"),
) as TauriConfig;
const { security } = config.app;
// The app is served over https://tauri.localhost (useHttpsScheme), so the web policy behind https
const web = appPolicy({ secure: true });

describe("the mobile app's CSP", () => {
  it("is not weaker than the web app's", () => {
    expect(weakerThan(web, security.csp ?? "")).toEqual([]);
  });

  it("has every directive of the web app's", () => {
    expect([...parsePolicy(security.csp ?? "").keys()]).toEqual(
      expect.arrayContaining([...parsePolicy(web).keys()]),
    );
  });

  it("is the only policy: no looser one for development, Tauri's hashes and nonces stay on", () => {
    expect(security.devCsp).toBeUndefined();
    expect(security.dangerousDisableAssetCspModification).toBeUndefined();
  });

  it("freezes Object.prototype and keeps the Tauri API off window", () => {
    expect(security.freezePrototype).toBe(true);
    expect(config.app.withGlobalTauri).toBe(false);
  });

  it("is served over https, so upgrade-insecure-requests and secure-context APIs hold", () => {
    expect(config.app.windows.every((window) => window.useHttpsScheme === true)).toBe(true);
  });
});

describe("weakerThan", () => {
  const strict = "default-src 'none'; script-src 'self'; connect-src 'self'";

  it("accepts the same policy", () => {
    expect(weakerThan(strict, strict)).toEqual([]);
  });

  it("accepts Tauri's IPC sources in connect-src only", () => {
    const app =
      "default-src 'none'; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost";
    expect(weakerThan(strict, app)).toEqual([]);
    expect(
      weakerThan(strict, "default-src 'none'; script-src 'self' ipc:; connect-src 'self'"),
    ).toEqual(["script-src allows ipc:"]);
  });

  it("finds a missing directive", () => {
    expect(weakerThan(strict, "default-src 'none'; connect-src 'self'")).toEqual([
      "script-src is missing",
    ]);
  });

  it("finds a source the web policy does not allow", () => {
    expect(
      weakerThan(
        strict,
        "default-src 'none'; script-src 'self' https://cdn.test; connect-src https:",
      ),
    ).toEqual(["script-src allows https://cdn.test", "connect-src allows https:"]);
  });

  it("refuses unsafe keywords even where the web policy had them", () => {
    const loose = "default-src 'none'; style-src 'self' 'unsafe-inline'";
    expect(weakerThan(loose, loose)).toEqual(["style-src allows 'unsafe-inline'"]);
  });

  it("reads directive names in any case", () => {
    expect(weakerThan(strict, "DEFAULT-SRC 'none'; Script-Src 'self'; connect-src 'self'")).toEqual(
      [],
    );
  });
});
