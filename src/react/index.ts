import type { ApiClient, ClientOptions, NamespacedEndpoints } from "../core/types";
import { createClient } from "../core/client";
import { Fetcher } from "../core/fetcher";
import { QueryCache } from "../core/cache";
import { createReactHooks } from "./hooks";

export function createApiClient<T extends NamespacedEndpoints>(options: ClientOptions<T>): ApiClient<T> {
  const fetcher = new Fetcher({
    baseURL: options.baseURL,
    credentials: options.credentials,
    headers: options.headers,
    retry: options.retry,
    onError: options.onError,
  });
  const cache = new QueryCache(options.cache);
  const hooks = createReactHooks(fetcher, cache);
  return createClient(options, hooks);
}
