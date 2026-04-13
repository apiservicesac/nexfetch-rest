import type { EndpointDef, EndpointMap, InputOf, NamespacedEndpoints, OutputOf } from "./types";
import type { RequestPipeline } from "./request-pipeline";

/**
 * A callable endpoint node. The only operation is `.call()` — a direct HTTP
 * request. Cache/query/mutation operations live on the root client, so endpoint
 * names like "fetch", "query", "useQuery" never collide with framework methods.
 */
export class EndpointNode<I = unknown, O = unknown> {
  constructor(
    readonly def: EndpointDef<I, O>,
    readonly path: string[],
    private readonly pipeline: RequestPipeline,
  ) {}

  call(input: I, opts?: { signal?: AbortSignal }): Promise<O> {
    return this.pipeline.execute<O>(this.def, input as unknown as { body?: unknown; query?: unknown; params?: Record<string, string> }, opts);
  }
}

/**
 * Identity helper that preserves the exact endpoint map type, enabling
 * precise type inference for the resulting client.
 */
export function defineEndpoints<T extends NamespacedEndpoints>(endpoints: T): T {
  return endpoints;
}

// ── Typed tree of EndpointNode instances ─────────────────────────────────────

export type EndpointTree<T extends NamespacedEndpoints> = {
  [NS in keyof T]: {
    [K in keyof T[NS]]: EndpointNode<InputOf<T[NS][K]>, OutputOf<T[NS][K]>>;
  };
};

export function buildEndpointTree<T extends NamespacedEndpoints>(
  endpoints: T,
  pipeline: RequestPipeline,
): EndpointTree<T> {
  const tree = {} as Record<string, Record<string, EndpointNode>>;
  for (const [namespace, map] of Object.entries(endpoints) as [string, EndpointMap][]) {
    const nsTree: Record<string, EndpointNode> = {};
    for (const [key, def] of Object.entries(map)) {
      nsTree[key] = new EndpointNode(def, [namespace, key], pipeline);
    }
    tree[namespace] = nsTree;
  }
  return tree as EndpointTree<T>;
}
