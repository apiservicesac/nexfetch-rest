import type { ClientOptions, NamespacedEndpoints } from "../core/types";
import { createClient } from "../core/client";
import { Fetcher } from "../core/fetcher";
import { QueryCache } from "../core/cache";

export function createApiClient<T extends NamespacedEndpoints>(options: ClientOptions<T>) {
  const fetcher = new Fetcher({
    baseURL: options.baseURL,
    credentials: options.credentials,
    headers: options.headers,
    retry: options.retry,
    onError: options.onError,
  });
  const cache = new QueryCache(options.cache);
  return createClient(options, undefined, { fetcher, cache });
}
