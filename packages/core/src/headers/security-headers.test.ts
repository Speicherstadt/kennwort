import { describe, expect, it } from "vitest";
import {
  API_POLICY,
  apiHeaders,
  appHeaders,
  appPolicy,
  HSTS,
  PERMISSIONS_POLICY,
} from "./security-headers.ts";

const APP_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; " +
  "connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

describe("appPolicy", () => {
  it("allows the app's own origin for exactly what it loads, nothing inline, no eval", () => {
    expect(appPolicy({ secure: false })).toBe(APP_POLICY);
  });

  it("upgrades insecure requests only behind https", () => {
    expect(appPolicy({ secure: true })).toBe(`${APP_POLICY}; upgrade-insecure-requests`);
  });
});

describe("API_POLICY", () => {
  it("lets a server answer run nothing, in a sandbox", () => {
    expect(API_POLICY).toBe("default-src 'none'; frame-ancestors 'none'; sandbox");
  });
});

describe("PERMISSIONS_POLICY", () => {
  it("allows the camera (QR scan), copying and the muted camera video, and denies the rest", () => {
    expect(PERMISSIONS_POLICY).toBe(
      "accelerometer=(), autoplay=(self), bluetooth=(), browsing-topics=(), camera=(self), " +
        "clipboard-read=(), clipboard-write=(self), display-capture=(), encrypted-media=(), " +
        "fullscreen=(), geolocation=(), gyroscope=(), hid=(), idle-detection=(), " +
        "local-fonts=(), magnetometer=(), microphone=(), midi=(), otp-credentials=(), " +
        "payment=(), picture-in-picture=(), publickey-credentials-create=(), " +
        "publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), " +
        "window-management=(), xr-spatial-tracking=()",
    );
  });
});

const COMMON = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "x-frame-options": "DENY",
  "permissions-policy": PERMISSIONS_POLICY,
};

describe("appHeaders", () => {
  it("carries the app's policy and the common headers, without HSTS over http", () => {
    expect(appHeaders({ secure: false })).toEqual({
      ...COMMON,
      "content-security-policy": APP_POLICY,
    });
  });

  it("adds HSTS and upgrades behind https", () => {
    expect(appHeaders({ secure: true })).toEqual({
      ...COMMON,
      "content-security-policy": `${APP_POLICY}; upgrade-insecure-requests`,
      "strict-transport-security": HSTS,
    });
  });

  it("leaves HSTS out on request, for answers the service worker makes up", () => {
    expect(appHeaders({ secure: true, hsts: false })).toEqual({
      ...COMMON,
      "content-security-policy": `${APP_POLICY}; upgrade-insecure-requests`,
    });
  });
});

describe("apiHeaders", () => {
  it("carries the sandbox policy and the common headers", () => {
    expect(apiHeaders({ secure: false })).toEqual({
      ...COMMON,
      "content-security-policy": API_POLICY,
    });
    expect(apiHeaders({ secure: true })).toEqual({
      ...COMMON,
      "content-security-policy": API_POLICY,
      "strict-transport-security": HSTS,
    });
  });
});

describe("HSTS", () => {
  it("holds for a year, without subdomains: those may not all speak https", () => {
    expect(HSTS).toBe("max-age=31536000");
  });
});
