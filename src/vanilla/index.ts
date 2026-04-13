import type { ClientOptions, NamespacedEndpoints } from "../core/types";
import { createClient, createRuntime } from "../core/client";

export function createApiClient<T extends NamespacedEndpoints>(options: ClientOptions<T>) {
  const runtime = createRuntime(options);
  return createClient(options, undefined, runtime);
}
