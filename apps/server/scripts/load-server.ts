// The server of the load test (K-702): the real app (createApp) with Weber Haustechnik's Büro vault
// and its signed log, behind Bun.serve as in main.ts; sessions are the sync tests' bearer tokens,
// so the test measures the sync and the live stream, not Argon2 at sign-in
import { syncSetup } from "../src/testing/sync-setup.ts";

const port = Number(process.env.KENNWORT_PORT ?? 28750);
const setup = syncSetup();
if ((await setup.openBuero()) !== 201) throw new Error("could not open Büro");
const server = Bun.serve({ port, idleTimeout: 60, fetch: setup.app.fetch });
console.log(JSON.stringify({ message: "listening", port: server.port }));
