import { describe, expect, it, vi } from "vitest";
import { loginToSave, nativeAutofill } from "./autofill-native.ts";
import type { Invoke } from "./native-send.ts";

// K-802: the JSON the Kotlin service hands over is parsed here; anything unexpected fills nothing
const request = {
  version: 1,
  requestId: "r-1",
  target: { kind: "app", id: "com.heizungsapp.monteur" },
  fields: ["username", "password"],
};

const invokeWith = (answers: Record<string, unknown>) =>
  vi.fn(async (command: string) => {
    if (command in answers) return answers[command];
    throw new Error("unknown command");
  }) as unknown as Invoke & ReturnType<typeof vi.fn>;

describe("nativeAutofill", () => {
  it("reads the pending request", async () => {
    const native = nativeAutofill(invokeWith({ autofill_pending: JSON.stringify(request) }));
    expect(await native.pending()).toEqual(request);
  });

  it.each([null, "", "{", JSON.stringify({ ...request, version: 2 })])(
    "finds no request in %j",
    async (answer) => {
      expect(await nativeAutofill(invokeWith({ autofill_pending: answer })).pending()).toBe(
        undefined,
      );
    },
  );

  it("finds nothing where the commands do not exist", async () => {
    const native = nativeAutofill(invokeWith({}));
    expect(await native.pending()).toBeUndefined();
    expect(await native.takeSave()).toBeUndefined();
    await expect(
      native.respond({ version: 1, requestId: "r-1", kind: "cancel" }),
    ).resolves.toBeUndefined();
  });

  it("sends the response as JSON text", async () => {
    const invoke = invokeWith({ autofill_respond: null });
    await nativeAutofill(invoke).respond({ version: 1, requestId: "r-1", kind: "cancel" });
    expect(invoke).toHaveBeenCalledWith("autofill_respond", {
      response: '{"version":1,"requestId":"r-1","kind":"cancel"}',
    });
  });
});

describe("loginToSave", () => {
  const base = { version: 1 as const, requestId: "s-1", username: "max", password: "pw" };

  it("stores an app login under its package", () => {
    expect(
      loginToSave({ ...base, target: { kind: "app", id: "com.heizungsapp.monteur" } }),
    ).toEqual({
      title: "com.heizungsapp.monteur",
      username: "max",
      password: "pw",
      website: "android://com.heizungsapp.monteur",
    });
  });

  it("stores a web login under the page's https address", () => {
    expect(
      loginToSave({ ...base, target: { kind: "web", host: "portal.weber-haustechnik.test" } })
        .website,
    ).toBe("https://portal.weber-haustechnik.test");
  });
});
