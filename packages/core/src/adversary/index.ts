// The lying server for tests (K-206): wrappers around an honest SyncServer and around fetch

export { lyingFetch, type Rewrite } from "./lying-fetch.ts";
export { flipByte, type Lie, lyingServer } from "./lying-server.ts";
