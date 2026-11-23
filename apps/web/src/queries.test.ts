import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createAccountQueries, createQueryClient, queryKeys } from "./queries.ts";

describe("the query cache", () => {
  it("is emptied with the opened account it belongs to", () => {
    let client = createQueryClient();
    createRoot((dispose) => {
      client = createAccountQueries();
      client.setQueryData(queryKeys.members, { names: ["Anna"] });
      expect(client.getQueryData(queryKeys.members)).toEqual({ names: ["Anna"] });
      dispose();
    });
    expect(client.getQueryCache().getAll()).toEqual([]);
  });

  it("retries nothing and loads nothing on its own when the window gets the focus back", () => {
    const { queries } = createQueryClient().getDefaultOptions();
    expect(queries).toMatchObject({
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  });

  it("names its data without a token, a key or a secret", () => {
    expect(Object.values(queryKeys).flat()).toEqual([
      "devices",
      "emergency",
      "groups",
      "members",
      "notifications",
      "notification-prefs",
      "policy",
      "recovery",
    ]);
  });
});
