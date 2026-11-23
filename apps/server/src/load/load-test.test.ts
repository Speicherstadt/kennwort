// K-702: the load test's smoke run, small enough for every CI run (a second or two); the full run
// with a hundred devices is scripts/load.ts in the nightly "Lasttest" workflow (docs/lasttest.md)
import { afterAll, describe, expect, it } from "bun:test";
import { syncSetup } from "../testing/sync-setup.ts";
import { percentiles, runLoad } from "./load-test.ts";

describe("load test", () => {
  it("takes nearest-rank percentiles", () => {
    const values = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(percentiles(values)).toEqual({ count: 100, p50: 50, p95: 95, p99: 99, max: 100 });
    expect(percentiles([])).toEqual({ count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  });

  const setup = syncSetup();
  const server = Bun.serve({ port: 0, fetch: setup.app.fetch });
  afterAll(() => server.stop(true));

  it("lets twelve devices hear every write of the others and read the same in the end", async () => {
    expect(await setup.openBuero()).toBe(201);
    const result = await runLoad({
      baseUrl: `http://localhost:${server.port}`,
      devices: 12,
      writesPerDevice: 2,
      pauseMs: 20,
    });
    expect(result.errors).toEqual([]);
    // eight of the twelve write (Jonas and Anna), each version reaches the eleven others
    expect(result.writes).toBe(16);
    expect(result.deliveries).toEqual({ expected: 16 * 11, received: 16 * 11 });
    expect(result.latency.pull.count).toBe(12);
  });
});
