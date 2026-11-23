// K-702: a new version reaches every open stream, and the server reads the vault's log once for
// all of them, not once per stream; the load test found each write cost ~0.4 ms per listening
// device, all on the one event loop (docs/lasttest.md)
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { recordToWire, sealRecord } from "@kennwort/core";
import { bank, contextFor, id, jonas } from "@kennwort/core/testing";
import { syncSetup, vaultId } from "../testing/sync-setup.ts";
import * as chain from "./vault-chain.ts";

const record = sealRecord(
  contextFor(jonas).author,
  contextFor(jonas).ring,
  id(0xe1),
  1,
  bank,
  new Uint8Array(),
);

/** Opens a stream and resolves with a function that waits for text in it */
const openStream = async (setup: ReturnType<typeof syncSetup>, token: string) => {
  const response = await setup.request(`/api/vaults/${vaultId}/events`, token);
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const until = async (needle: string) => {
    while (!text.includes(needle)) {
      const { done, value } = await reader.read();
      if (done) throw new Error("stream ended");
      text += decoder.decode(value, { stream: true });
    }
  };
  await until("event: ready");
  return { until, cancel: () => reader.cancel() };
};

describe("live fan-out", () => {
  const spies: { mockRestore: () => void }[] = [];
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  it("tells all twenty streams of a new version and checks membership once for them", async () => {
    const setup = syncSetup();
    expect(await setup.openBuero()).toBe(201);
    const tokens = ["t-jonas", "t-anna", "t-max"];
    const streams = await Promise.all(
      Array.from({ length: 20 }, (_, i) => openStream(setup, tokens[i % 3] as string)),
    );
    const reads = spyOn(chain, "currentMembers");
    const selects = spyOn(setup.db, "select");
    spies.push(reads, selects);
    const put = await setup.request(`/api/vaults/${vaultId}/records`, "t-jonas", {
      method: "PUT",
      body: recordToWire(record),
    });
    expect(put.status).toBe(200);
    await Promise.all(streams.map((s) => s.until("event: record")));
    // once for the writer's own role, once for everyone listening
    expect(reads.mock.calls.length).toBeLessThanOrEqual(2);
    // and who left the company is looked up per member, not per stream (three members, 20 streams)
    expect(selects.mock.calls.length).toBeLessThan(20);
    await Promise.all(streams.map((s) => s.cancel()));
  });
});
