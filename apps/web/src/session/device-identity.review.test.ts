import { describe, expect, it } from "vitest";
import { deviceName } from "./device-identity.ts";

// Review of K-303 part 6: browsers on iOS say "Safari/" too, but name themselves CriOS/FxiOS/EdgiOS
describe("deviceName on iOS", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
      "Chrome · iPhone",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15",
      "Firefox · iPhone",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 EdgiOS/140.0 Mobile/15E148 Safari/605.1.15",
      "Edge · iPhone",
    ],
  ])("names %s as %s, not as Safari", (userAgent, name) => {
    expect(deviceName(userAgent)).toBe(name);
  });
});
