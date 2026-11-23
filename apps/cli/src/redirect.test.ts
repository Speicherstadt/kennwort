// The CLI sends with the platform's own fetch: a redirect from the server must not carry a body on
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type Send, serverFetch } from "@kennwort/client/session/server-fetch.ts";
import { describe, expect, it } from "vitest";

describe("a redirect from the server", () => {
  it("sends nothing on to another host when the server answers with a redirect", async () => {
    const elsewhere = { hits: 0 };
    const other = createServer((_req, res) => {
      elsewhere.hits += 1;
      res.end("{}");
    });
    const otherOrigin = await listen(other);
    const server = createServer((_req, res) => {
      res.writeHead(307, { location: `${otherOrigin}/steal` }).end();
    });
    const origin = await listen(server);
    try {
      const send: Send = (input, init) => fetch(input, init);
      await expect(
        serverFetch(origin, send)("/api/sign-in", { method: "POST", body: "proof" }),
      ).rejects.toThrow();
      expect(elsewhere.hits).toBe(0);
    } finally {
      server.close();
      other.close();
    }
  });
});

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    }),
  );
