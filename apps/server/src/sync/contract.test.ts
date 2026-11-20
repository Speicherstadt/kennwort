// The sync contract (packages/core) against the real server: the same suite as against the
// stand-in (K-207), so the two answer alike
import { afterAll } from "bun:test";
import { syncContract } from "@kennwort/core/contract";
import { syncSetup } from "../testing/sync-setup.ts";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterAll(() => {
  for (const server of servers) server.stop(true);
});

syncContract("apps/server", async () => {
  const setup = syncSetup();
  const server = Bun.serve({ port: 0, fetch: setup.app.fetch });
  servers.push(server);
  return {
    connect: (token) => ({ fetch, baseUrl: `http://localhost:${server.port}`, token }),
    listening: setup.app.hub.listening,
  };
});
