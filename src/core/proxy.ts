import type { EndpointDef, HookFactory, NamespacedEndpoints } from "./types";
import type { Fetcher } from "./fetcher";

export function createNamespaceProxy<T extends NamespacedEndpoints>(
  endpoints: T,
  fetcher: Fetcher,
  hooks: HookFactory,
): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_, namespace: string) {
      const nsEndpoints = endpoints[namespace];
      if (!nsEndpoints) return undefined;

      return new Proxy({} as Record<string, unknown>, {
        get(_, method: string) {
          if (method === "useQuery") {
            return (key: string, input?: unknown, options?: { enabled?: boolean }) => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useQuery(namespace, key, endpoint, input, options);
            };
          }

          if (method === "useMutation") {
            return (key: string) => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useMutation(namespace, key, endpoint);
            };
          }

          // Direct fetch: api.projects.list({ query: { orgId } })
          const endpoint = nsEndpoints[method] as EndpointDef | undefined;
          if (endpoint) {
            return (input?: { body?: unknown; query?: unknown; params?: Record<string, string> }) =>
              fetcher.request(endpoint, input);
          }

          return undefined;
        },
      });
    },
  });
}
