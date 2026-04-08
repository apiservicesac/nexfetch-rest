import type { EndpointDef, EndpointMap } from "../core/types";

/**
 * Define a set of endpoints with optional schema validation.
 * Schemas can be Zod, Valibot, Arktype, or any object with a .parse() method.
 * If no schema is provided, raw data is passed through without validation.
 *
 * @example
 * ```typescript
 * // With Zod (optional dependency):
 * import { z } from "zod";
 * const endpoints = defineEndpoints({
 *   list: { path: "/api/items", method: "GET", response: z.array(itemSchema) },
 * });
 *
 * // Without any validator:
 * const endpoints = defineEndpoints({
 *   list: { path: "/api/items", method: "GET" },
 * });
 * ```
 */
export function defineEndpoints<T extends EndpointMap>(endpoints: T): T {
  return endpoints;
}

export type { EndpointDef };
