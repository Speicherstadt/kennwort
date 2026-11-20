/** For the interface tests: what the app renders inside the opened account's query cache */
import type { JSX } from "@solidjs/web";
import { QueryClientProvider } from "@tanstack/solid-query";
import { createQueryClient } from "./queries.ts";

export const withQueries = (view: () => JSX.Element, client = createQueryClient()) => (
  <QueryClientProvider client={client}>{view()}</QueryClientProvider>
);
