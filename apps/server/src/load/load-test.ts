/**
 * The load test (K-702, docs/lasttest.md): N devices of Weber Haustechnik hold a live stream (SSE)
 * on the Büro vault, the editors among them write and sync, and every device must hear every new
 * version. Measures request latency, the time from a write until each other device hears of it,
 * and errors; the caller adds the server's memory. Clients run the real sync of packages/core, so
 * every pull checks signatures as a browser would.
 */
import {
  type Connection,
  emptyDevice,
  encodeBytes,
  httpServer,
  pull,
  sealRecord,
  watchVault,
} from "@kennwort/core";
import { anna, bank, contextFor, jonas, max, withField } from "@kennwort/core/testing";

export type LoadOptions = {
  baseUrl: string;
  devices: number;
  writesPerDevice: number;
  /** Longest pause before a write (default 1 s): writes overlap like people's, not in lockstep */
  pauseMs?: number;
  /** How long a device may take to hear a change before it counts as lost */
  deliveryTimeoutMs?: number;
};

export type Percentiles = { count: number; p50: number; p95: number; p99: number; max: number };

export type LoadResult = {
  devices: number;
  writes: number;
  connectMs: number;
  durationMs: number;
  latency: { push: Percentiles; pull: Percentiles };
  propagation: Percentiles;
  deliveries: { expected: number; received: number };
  errors: string[];
};

const round = (n: number) => Math.round(n * 10) / 10;

/** Nearest-rank percentiles of a list of milliseconds */
export const percentiles = (values: number[]): Percentiles => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
  return {
    count: sorted.length,
    p50: round(at(50)),
    p95: round(at(95)),
    p99: round(at(99)),
    max: round(sorted.at(-1) ?? 0),
  };
};

/** Jonas manages Büro, Anna edits, Max reads (the fixtures' log): devices take turns among them */
const people = [
  { person: jonas, token: "t-jonas", writes: true },
  { person: anna, token: "t-anna", writes: true },
  { person: max, token: "t-max", writes: false },
] as const;
type Simulated = (typeof people)[number] & { index: number; heard: Map<string, number> };

const ring = contextFor(jonas).ring;
/** One entry per writing device, so writers never conflict with each other */
const entryIdOf = (index: number) => {
  const id = new Uint8Array(16);
  id[0] = 0x1a;
  new DataView(id.buffer).setUint32(12, index + 1);
  return id;
};
const changeKey = (entryId: Uint8Array, version: number) => `${encodeBytes(entryId)}:${version}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Samples = { push: number[]; pull: number[] };

/** A fetch that times every request but the stream, by kind, and notes every failure */
const timedFetch = (samples: Samples, errors: string[]): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const kind = init?.method === "PUT" ? "push" : url.endsWith("/records") ? "pull" : undefined;
    const started = performance.now();
    const response = await fetch(input, init).catch((error: unknown) => {
      if (!init?.signal?.aborted) errors.push(`${kind ?? "stream"}: ${String(error)}`);
      throw error;
    });
    if (kind) samples[kind].push(performance.now() - started);
    if (!response.ok && response.status !== 409)
      errors.push(`${kind ?? "stream"}: ${response.status}`);
    return response;
  }) as typeof fetch;

/** Opens every device's stream; resolves once all said "ready" or the time ran out */
const openStreams = async (
  all: Simulated[],
  connect: (token: string) => Connection,
  signal: AbortSignal,
  errors: string[],
  timeoutMs: number,
) => {
  let waiting = all.length;
  const ready = Promise.withResolvers<void>();
  for (const device of all)
    void watchVault(
      connect(device.token),
      ring.vaultId,
      (event) => {
        if (event.type === "ready" && --waiting === 0) ready.resolve();
        if (event.type === "change")
          device.heard.set(changeKey(event.entryId, event.version), performance.now());
      },
      signal,
    ).catch((error: unknown) => errors.push(`stream ${device.index}: ${String(error)}`));
  await Promise.race([ready.promise, sleep(timeoutMs)]);
  if (waiting > 0) errors.push(`${waiting} streams not ready`);
};

type Sent = Map<string, { at: number; by: number }>;

/**
 * One device writes its entry again and again: sealed and signed as the sync's push does, without
 * pulling the whole vault before each write, so one load process can play a hundred devices
 * without its own signature checks hiding the server's latency
 */
const writeAll = async (
  device: Simulated,
  connect: (token: string) => Connection,
  options: { writes: number; pauseMs: number },
  sent: Sent,
  errors: string[],
) => {
  const entryId = entryIdOf(device.index);
  const server = httpServer(connect(device.token), ring.vaultId);
  const { author } = contextFor(device.person);
  for (let n = 1; n <= options.writes; n++) {
    await sleep(Math.random() * options.pauseMs);
    const content = withField(bank, "password", `Last-${device.index}-${n}`);
    const record = sealRecord(author, ring, entryId, n, content, new Uint8Array());
    sent.set(changeKey(entryId, n), { at: performance.now(), by: device.index });
    try {
      if ((await server.push(record)).ok) continue;
      errors.push(`push ${device.index}: refused version ${n}`);
    } catch (error) {
      errors.push(`push ${device.index}: ${String(error)}`);
    }
    return;
  }
};

/**
 * Then every device syncs at once, as each would on hearing the changes: a full pull with every
 * signature checked, and the device must read one entry per writer at its last version
 */
const syncAll = (
  all: Simulated[],
  connect: (token: string) => Connection,
  writes: number,
  errors: string[],
) => {
  const writers = all.filter((d) => d.writes).length;
  return Promise.all(
    all.map(async (device) => {
      const server = httpServer(connect(device.token), ring.vaultId);
      try {
        const pulled = await pull(emptyDevice(), server, contextFor(device.person));
        const complete = [...pulled.device.known.values()].filter((k) => k.version === writes);
        if (pulled.refused.length > 0 || complete.length !== writers)
          errors.push(`sync ${device.index}: ${complete.length} of ${writers} entries complete`);
      } catch (error) {
        errors.push(`sync ${device.index}: ${String(error)}`);
      }
    }),
  );
};

/** How many of the sent versions each device but its writer heard, and how long each took */
const deliveriesOf = (all: Simulated[], sent: Sent) => {
  const times = all.flatMap((d) =>
    [...sent].flatMap(([key, s]) => {
      const heard = d.heard.get(key);
      return s.by !== d.index && heard !== undefined ? [heard - s.at] : [];
    }),
  );
  return { expected: sent.size * (all.length - 1), received: times.length, times };
};

export const runLoad = async (options: LoadOptions): Promise<LoadResult> => {
  const { baseUrl, devices, writesPerDevice, pauseMs = 1000, deliveryTimeoutMs = 10_000 } = options;
  const samples: Samples = { push: [], pull: [] };
  const errors: string[] = [];
  const connect = (token: string): Connection => ({
    fetch: timedFetch(samples, errors),
    baseUrl,
    token,
  });
  const all: Simulated[] = Array.from({ length: devices }, (_, index) => ({
    ...(people[index % people.length] as (typeof people)[number]),
    index,
    heard: new Map(),
  }));
  const stop = new AbortController();
  const started = performance.now();
  await openStreams(all, connect, stop.signal, errors, deliveryTimeoutMs);
  const connectMs = performance.now() - started;

  const sent: Sent = new Map();
  const writeStart = performance.now();
  const writing = { writes: writesPerDevice, pauseMs };
  await Promise.all(
    all.filter((d) => d.writes).map((d) => writeAll(d, connect, writing, sent, errors)),
  );
  const deadline = performance.now() + deliveryTimeoutMs;
  let delivered = deliveriesOf(all, sent);
  while (delivered.received < delivered.expected && performance.now() < deadline) {
    await sleep(20);
    delivered = deliveriesOf(all, sent);
  }
  const durationMs = performance.now() - writeStart;
  if (delivered.received < delivered.expected)
    errors.push(`${delivered.expected - delivered.received} changes not heard`);
  await syncAll(all, connect, writesPerDevice, errors);
  stop.abort();
  return {
    devices,
    writes: sent.size,
    connectMs: Math.round(connectMs),
    durationMs: Math.round(durationMs),
    latency: { push: percentiles(samples.push), pull: percentiles(samples.pull) },
    propagation: percentiles(delivered.times),
    deliveries: { expected: delivered.expected, received: delivered.received },
    errors,
  };
};
