/**
 * Who is listening for which vault: the live sync (SSE) subscribes, a stored record publishes. In
 * memory, because one server process serves all its clients; the event names only entry and
 * version, the client fetches and checks the record itself.
 */
export type Change = { entryId: string; version: number };
type Listener = (change: Change) => void;

export const createHub = () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    subscribe: (vaultId: string, listener: Listener) => {
      const set = listeners.get(vaultId) ?? new Set();
      listeners.set(vaultId, set.add(listener));
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(vaultId);
      };
    },
    publish: (vaultId: string, change: Change) => {
      for (const listener of listeners.get(vaultId) ?? []) listener(change);
    },
    listening: (vaultId: string) => listeners.get(vaultId)?.size ?? 0,
  };
};

export type Hub = ReturnType<typeof createHub>;
