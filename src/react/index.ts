import type { ApiClient, ClientOptions, NamespacedEndpoints } from "../core/types";
import { createClient, createRuntime } from "../core/client";
import { createReactHooks } from "./hooks";

export function createApiClient<T extends NamespacedEndpoints>(options: ClientOptions<T>): ApiClient<T> {
  const { fetcher, cache } = createRuntime(options);
  const hooks = createReactHooks(fetcher, cache);
  return createClient(options, hooks, { fetcher, cache });
}
