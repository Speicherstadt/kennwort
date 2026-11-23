/**
 * Who is listening for what: the live sync (SSE) subscribes per vault, a stored record publishes;
 * the notifications (K-602) subscribe per account. In memory, because one server process serves
 * all its clients; an event names only IDs, the client fetches and checks the rest itself.
 */
export type Change = { entryId: string; version: number };

export const createHub = <T = Change>() => {
  type Listener = (event: T) => void;
  const listeners = new Map<string, Set<Listener>>();
  return {
    subscribe: (key: string, listener: Listener) => {
      const set = listeners.get(key) ?? new Set();
      listeners.set(key, set.add(listener));
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
    publish: (key: string, event: T) => {
      for (const listener of listeners.get(key) ?? []) listener(event);
    },
    listening: (key: string) => listeners.get(key)?.size ?? 0,
  };
};

export type Hub = ReturnType<typeof createHub<Change>>;
