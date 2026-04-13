import type { EndpointDef, EndpointMap, FetchInput } from "./types";

/**
 * Define a set of endpoints with optional schema validation.
 * Schemas can be Zod, Valibot, Arktype, or any object with a `.parse()` method.
 * If no schema is provided, raw data is passed through without validation.
 *
 * @example
 * ```ts
 * const endpoints = defineEndpoints({
 *   list: { path: "/items", method: "GET", response: z.array(itemSchema) },
 * });
 * ```
 */
export function defineEndpoints<T extends EndpointMap>(endpoints: T): T {
  return endpoints;
}

export function buildQueryKey(namespace: string, key: string, input?: FetchInput): string {
  return input ? `${namespace}.${key}:${JSON.stringify(input)}` : `${namespace}.${key}`;
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function getEndpoint(endpoints: EndpointMap, namespace: string, key: string): EndpointDef {
  const endpoint = endpoints[key];
  if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
  return endpoint;
}

export interface MutationState {
  data: unknown;
  isPending: boolean;
  error: Error | null;
}

export const INITIAL_MUTATION_STATE: MutationState = {
  data: null,
  isPending: false,
  error: null,
};
