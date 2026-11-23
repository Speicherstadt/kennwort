// The load test (K-702, docs/lasttest.md): starts the load server in its own process on its own
// port, runs N devices against it, samples the server's memory and checks the targets of
// docs/plan.md ("Lasttest"). `bun scripts/load.ts [devices] [writes per device]`; exits 1 on a miss
import { readFileSync } from "node:fs";
import { type LoadResult, runLoad } from "../src/load/load-test.ts";
import { startServer } from "../src/testing/start-server.ts";

const devices = Number(process.argv[2] ?? 100);
const writesPerDevice = Number(process.argv[3] ?? 5);
const port = Number(process.env.KENNWORT_LOAD_PORT ?? 28750);
/** The targets of docs/plan.md, "Lasttest" */
const targets = { pushP95: 250, propagationP95: 500, propagationP99: 1000, rssMiB: 256 };

const { child } = await startServer(["bun", "scripts/load-server.ts"], port);
const rssMiB = () => {
  const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
  return Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024;
};
const before = rssMiB();
let peak = before;
const sampler = setInterval(() => {
  peak = Math.max(peak, rssMiB());
}, 100);
let result: LoadResult;
try {
  result = await runLoad({ baseUrl: `http://127.0.0.1:${port}`, devices, writesPerDevice });
} finally {
  clearInterval(sampler);
  child.kill();
}
const memory = { beforeMiB: Math.round(before), peakMiB: Math.round(peak) };
console.log(JSON.stringify({ ...result, memory }, null, 2));
const misses = [
  result.errors.length > 0 && `${result.errors.length} errors`,
  result.latency.push.p95 > targets.pushP95 && `push p95 ${result.latency.push.p95} ms`,
  result.propagation.p95 > targets.propagationP95 && `propagation p95 ${result.propagation.p95} ms`,
  result.propagation.p99 > targets.propagationP99 && `propagation p99 ${result.propagation.p99} ms`,
  peak > targets.rssMiB && `server memory ${Math.round(peak)} MiB`,
].filter(Boolean);
if (misses.length > 0) {
  console.error(`missed targets: ${misses.join(", ")}`);
  process.exit(1);
}
console.log("all targets met");
