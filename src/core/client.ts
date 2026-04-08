import type { ClientOptions, HookFactory, NamespacedEndpoints } from "./types";
import { Fetcher } from "./fetcher";
import { QueryCache } from "./cache";
import { createNamespaceProxy } from "./proxy";

export function createCoreClient<T extends NamespacedEndpoints>(
  options: ClientOptions<T>,
  hooks: HookFactory,
) {
  const fetcher = new Fetcher({
    baseURL: options.baseURL,
    credentials: options.credentials,
    headers: options.headers,
    retry: options.retry,
    onError: options.onError,
  });

  const cache = new QueryCache(options.cache);

  return { proxy: createNamespaceProxy(options.endpoints, fetcher, hooks), fetcher, cache };
}

export { QueryCache } from "./cache";
export { Fetcher } from "./fetcher";
