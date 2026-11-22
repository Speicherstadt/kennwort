/**
 * The part of the extension APIs the popup uses, for running the built popup as a page in
 * Playwright's Firefox and WebKit, which cannot load extensions (K-407). Injected with
 * addInitScript before the popup's own code; serialised, so it closes over nothing.
 *
 * It is a stand-in for the browser, not for Kennwort: the session area is a Map in the page's
 * memory, with setAccessLevel only where the browser has it (Chrome, Safari 17.1+; not Firefox),
 * the lock alarm only records when it would ring, and the windows API is missing in the Firefox
 * build as on Firefox for Android. What the test checks (the unlock against the real server,
 * what lands in the session area, the lock) is the popup's own code, as built for that browser.
 */
export type ApiOptions = {
  /** The address of the tab the popup was opened over */
  pageUrl: string;
  /** Whether the session area offers setAccessLevel */
  accessLevel: boolean;
  /** Whether the browser has a windows API (not Firefox for Android, not Safari on iOS) */
  windows: boolean;
};

/** What the test reads back through `globalThis.kennwortTest` */
export type ApiRecord = {
  session: Record<string, unknown>;
  accessLevel: string | undefined;
  alarms: Record<string, number>;
};

export const installBrowserApi = (options: ApiOptions) => {
  const session = new Map<string, unknown>();
  const alarms = new Map<string, number>();
  const record: { accessLevel: string | undefined } = { accessLevel: undefined };
  const listeners: ((changes: Record<string, unknown>) => void)[] = [];
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
  const changed = (keys: string[]) => {
    const changes = Object.fromEntries(keys.map((key) => [key, { newValue: session.get(key) }]));
    for (const listener of listeners) listener(changes);
  };
  const area = {
    get: async (key: string | null) =>
      Object.fromEntries(
        [...session].filter(([name]) => key === null || name === key).map(([n, v]) => [n, copy(v)]),
      ),
    set: async (items: Record<string, unknown>) => {
      for (const [name, value] of Object.entries(items)) session.set(name, copy(value));
      changed(Object.keys(items));
    },
    remove: async (key: string) => {
      session.delete(key);
      changed([key]);
    },
    onChanged: {
      addListener: (listener: (changes: Record<string, unknown>) => void) =>
        listeners.push(listener),
    },
    ...(options.accessLevel
      ? {
          setAccessLevel: async ({ accessLevel }: { accessLevel: string }) => {
            record.accessLevel = accessLevel;
          },
        }
      : {}),
  };
  const tab = { id: 1, url: options.pageUrl };
  const chrome = {
    runtime: {
      id: "kennwort-engine-test",
      getURL: (path: string) => new URL(path, location.origin).href,
      sendMessage: async () => undefined,
      onMessage: { addListener: () => {} },
    },
    storage: { session: area },
    alarms: {
      create: async (name: string, info: { when: number }) => {
        alarms.set(name, info.when);
      },
      get: async (name: string) =>
        alarms.has(name) ? { name, scheduledTime: alarms.get(name) as number } : undefined,
      clear: async (name: string) => alarms.delete(name),
    },
    tabs: { query: async () => [tab] },
    ...(options.windows ? { windows: { getLastFocused: async () => ({ id: 1 }) } } : {}),
  };
  const test = {
    read: (): ApiRecord => ({
      session: Object.fromEntries(session),
      accessLevel: record.accessLevel,
      alarms: Object.fromEntries(alarms),
    }),
  };
  Object.assign(globalThis, { chrome, kennwortTest: test });
};
