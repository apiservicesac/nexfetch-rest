# @nexfetch/rest

Typed REST client with endpoint-level typing, reactive cache, retry, GET deduplication, tag-based invalidation, pagination, and runtime schema validation.

- Zero runtime dependencies
- Works in React, vanilla JS, and any framework that can bridge a minimal `Observable<T>` contract
- Cache and mutation semantics are explicit — no magic, no hidden behavior

## Install

```bash
npm install @nexfetch/rest
```

## Quick start

### 1. Define endpoints

```ts
import { defineEndpoints } from "@nexfetch/rest";
import { z } from "zod";

const projectSchema = z.object({ id: z.string(), name: z.string() });

export const projectEndpoints = defineEndpoints({
  projects: {
    list: {
      path: "/projects",
      method: "GET",
      query: z.object({ orgId: z.string() }),
      response: z.array(projectSchema),
      tags: ["projects"],
      staleTime: 30_000,
    },
    get: {
      path: "/projects/:id",
      method: "GET",
      params: z.object({ id: z.string() }),
      response: projectSchema,
      tags: ["projects"],
    },
    create: {
      path: "/projects",
      method: "POST",
      body: z.object({ name: z.string() }),
      response: projectSchema,
      invalidates: ["projects"],
    },
    remove: {
      path: "/projects/:id",
      method: "DELETE",
      params: z.object({ id: z.string() }),
      invalidates: ["projects"],
    },
  },
});
```

### 2. Create the client

#### React

```ts
import { createReactClient } from "@nexfetch/rest/react";

export const client = createReactClient({
  baseURL: "https://api.example.com",
  credentials: "include",
  endpoints: projectEndpoints,
  cache: { staleTime: 30_000, refetchOnFocus: true },
  retry: { retries: 3 },
});
```

#### Vanilla

```ts
import { createClient } from "@nexfetch/rest";

export const client = createClient({
  baseURL: "https://api.example.com",
  endpoints: projectEndpoints,
});
```

### 3. Use it

#### React

```tsx
function ProjectList() {
  const { data, status, error } = client.useQuery(
    client.projects.list,
    { query: { orgId: "acme" } },
  );

  if (status === "pending") return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  return <ul>{data?.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}

function CreateProjectButton() {
  const createProject = client.useMutation(client.projects.create);

  return (
    <button
      disabled={createProject.status === "pending"}
      onClick={() => createProject.mutate({ body: { name: "New" } })}
    >
      Create
    </button>
  );
}
```

#### Vanilla

```ts
// Direct HTTP call (no cache):
const projects = await client.projects.list.call({ query: { orgId: "acme" } });

// Reactive cached query:
const q = client.query(client.projects.list, { query: { orgId: "acme" } });
const unsubscribe = q.state.subscribe((s) => console.log(s.data));
await q.refetch();
q.dispose();

// Mutation:
const m = client.mutation(client.projects.create);
await m.mutate({ body: { name: "Portal" } });

// Tag invalidation:
client.cache.invalidateByTag("projects");
```

## Core concepts

### Endpoints are callable nodes

Each endpoint becomes an `EndpointNode` with exactly **one** method: `.call(input)`. Endpoint names can be anything — including `fetch`, `query`, `useQuery` — without colliding with framework methods.

```ts
// Literally naming an endpoint "fetch" is fine:
endpoints: {
  users: {
    fetch: { path: "/users/fetch", method: "POST", body: QuerySchema },
  },
}

// No collision:
await client.users.fetch.call({ body: { q: "ada" } });
```

### Two ways to call an endpoint — and they mean different things

| Call | Cache? | Reactive? | Returns |
|---|---|---|---|
| `client.<ns>.<name>.call(input)` | No | No | `Promise<Output>` |
| `client.query(endpoint, input)` | Yes | Yes (`Observable<QueryState>`) | `Query<I,O>` |

There is no hidden third way. Direct calls never touch the cache. Cached calls always go through `client.query(...)` or one of the hooks.

### Operations live on the root client

`query`, `mutation`, `infiniteQuery`, and `cache` are methods of the **root client**, not per-endpoint properties. This is why endpoint names can be anything — they never compete with framework names.

```ts
client.query(endpoint, input);
client.mutation(endpoint);
client.infiniteQuery(endpoint, { pagination });
client.cache.invalidateByTag("tag");
```

### Per-subscription `select`

`select` is a projection applied at the subscription level, **not** baked into the cache entry. Two components can observe the same cache key with different projections, each receiving its own derived state.

```ts
// Component A sees the user's name
client.useQuery(client.users.get, input, { select: (u) => u.name });
// Component B sees the full object — same cache entry, different view
client.useQuery(client.users.get, input);
```

### Schema validation runs before the request

If an endpoint declares a `body`, `query`, or `params` schema, the input is validated **before** the HTTP request is sent. A `ValidationError` is thrown and the network call never happens. `response` schemas are still applied to the returned JSON as before.

### Missing path params throw a clear error

If the path is `/users/:id` and you don't pass `params`, you get:

```
Missing path params: :id in "/users/:id". Pass them as { params: { ... } }
```

before the request is built.

## API reference

### Endpoint definition

```ts
interface EndpointDef {
  path: string;                // e.g. "/users/:id"
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: Schema;               // input schema — also drives TS types
  query?: Schema;
  params?: Schema;
  response?: Schema;           // parses the response JSON
  headers?: Record<string, string>;
  staleTime?: number;
  tags?: string[];             // for invalidateByTag
  invalidates?: string[];      // tags that this mutation invalidates
  retry?: Partial<RetryConfig>;// per-endpoint retry override
  transform?: (raw: unknown) => unknown;
}
```

### Input shape

A single canonical input shape, inferred from the schemas:

```ts
client.projects.list.call({ query: { orgId: "acme" } });
client.projects.get.call({ params: { id: "p_123" } });
client.projects.create.call({ body: { name: "Portal" } });
```

If an endpoint has no `body`/`query`/`params` schema, its input type is `void`.

### Client options

```ts
interface ClientOptions<T> {
  baseURL: string;
  endpoints: T;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  cache?: {
    staleTime?: number;       // default 0
    gcTime?: number;          // default 5 * 60 * 1000
    refetchOnFocus?: boolean; // default false
  };
  retry?: {
    retries?: number;         // default 2
    retryDelay?: number;      // default 1000
    retryOn?: number[];       // default [408, 500, 502, 503, 504]
  };
  onError?: (error: ApiError) => void;
}
```

### Vanilla client surface

```ts
interface VanillaClient<T> extends EndpointTree<T> {
  readonly cache: QueryCache;

  query<I, O>(endpoint: EndpointNode<I, O>, input: I): Query<I, O>;
  mutation<I, O>(endpoint: EndpointNode<I, O>, opts?: MutationOptions<I, O>): Mutation<I, O>;
  infiniteQuery<I, O>(endpoint: EndpointNode<I, O>, opts: InfiniteQueryOptions<I>): InfiniteQuery<I, O>;
}
```

### React client surface

A `ReactClient<T>` is a `VanillaClient<T>` with hooks attached:

```ts
interface ReactClientExtensions {
  useQuery<I, O, Sel = O>(
    endpoint: EndpointNode<I, O>,
    input: I,
    opts?: { enabled?: boolean; refetchInterval?: number; select?: (data: O) => Sel },
  ): QueryState<Sel>;

  useMutation<I, O>(endpoint: EndpointNode<I, O>): UseMutationResult<I, O>;

  useInfiniteQuery<I, O>(
    endpoint: EndpointNode<I, O>,
    opts: InfiniteQueryOptions<I>,
  ): UseInfiniteQueryResult<O>;
}
```

Calling `.useQuery` on a **vanilla** client is a TypeScript error — not a runtime throw.

### Query handle

```ts
class Query<I, O> {
  readonly state: Observable<QueryState<O>>;
  project<Sel>(select: (data: O) => Sel): Observable<QueryState<Sel>>;
  refetch(): Promise<void>;
  invalidate(): void;
  dispose(): void;
}

interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  status: "idle" | "pending" | "success" | "error";
  isFetching: boolean;
}
```

### Mutation handle

```ts
class Mutation<I, O> {
  readonly state: Observable<MutationState<O>>;
  mutate(input: I, opts?: MutationOptions<I, O>): Promise<O>;
  reset(): void;
}

interface MutationState<T> {
  data: T | undefined;
  error: Error | undefined;
  status: "idle" | "pending" | "success" | "error";
}
```

### Infinite query handle

Works from **any** framework (vanilla, React, Vue). Each page is stored in the shared cache with the endpoint's tags, so `invalidateByTag` reaches paginated data.

```ts
interface InfiniteQueryOptions<I> {
  input?: I;
  pagination:
    | { type: "offset"; pageSize: number; pageParam?: string }
    | { type: "cursor"; cursorField: string; cursorParam?: string }
    | { type: "total"; totalField: string; pageSize: number; pageParam?: string };
  enabled?: boolean;
}

class InfiniteQuery<I, O> {
  readonly state: Observable<InfiniteQueryState<O>>;
  fetchNext(): Promise<void>;
  refetch(): Promise<void>;
  dispose(): void;
}

interface InfiniteQueryState<T> {
  pages: T[][];
  flat: T[];
  status: "idle" | "pending" | "success" | "error";
  error: Error | undefined;
  isFetchingMore: boolean;
  hasMore: boolean;
}
```

## Observables — the reactive contract

`@nexfetch/rest` exposes a minimal reactive contract called `Observable<T>`:

```ts
interface Observable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}
```

`Query.state`, `Mutation.state`, and `InfiniteQuery.state` are all `Observable<...>`. The React adapter bridges them via `useSyncExternalStore`. Writing an adapter for Vue, Solid, Svelte, or Preact Signals requires only a small bridge to their respective reactive primitive.

A 40-line in-house implementation powers this — no external reactive library is required.

## Cache

```ts
class QueryCache {
  getOrCreate<T>(key: string, fetcher, meta): CacheEntry<T>;
  get<T>(key: string): CacheEntry<T> | undefined;
  subscribe(key: string): () => void;
  invalidateByTag(tag: string): void;
  invalidateByKey(key: string): void;
  ensureFresh(key: string): void;
}
```

Features:

- Stable query keys derived from endpoint path + input (order-independent, nested objects supported)
- Tag index for O(1) invalidation by tag
- Reference-counted subscriptions with `gcTime`-delayed cleanup
- Optional refetch-on-visibilitychange
- Same entries are shared between `client.query(...)` calls and hooks

## Retry

Exponential backoff on configured HTTP status codes. Configurable globally or **per endpoint**:

```ts
endpoints: {
  flakyApi: {
    get: { path: "/thing", method: "GET", retry: { retries: 5 } },
  }
}
```

## Deduplication

Concurrent GET requests with the same method+path+input share a single in-flight promise. Non-GET methods are never deduplicated.

## Validation

| Schema field | When it runs | What happens on failure |
|---|---|---|
| `params` | Before building the URL | `ValidationError` thrown; request never sent |
| `query`  | Before building the URL | `ValidationError` thrown; request never sent |
| `body`   | Before the fetch call | `ValidationError` thrown; request never sent |
| `response` | After JSON is parsed | `ValidationError` thrown; caller sees the rejection |

Any object with a `.parse()` method works (Zod, Valibot, Arktype, custom).

## React hooks

```ts
import { useQuery, useMutation, useInfiniteQuery, useObservable } from "@nexfetch/rest/react";
```

The hooks are also available bound to a specific client as `client.useQuery` / `client.useMutation` / `client.useInfiniteQuery` via `createReactClient`.

`useObservable(obs)` is exported so you can subscribe to arbitrary `Observable<T>` values from components (e.g., `Query.project(...)` results).

## Vue

```ts
import { createClient } from "@nexfetch/rest/vue";
```

Today this re-exports the vanilla client. Native Vue composables (backed by `shallowRef`) are a roadmap item. In the meantime you can write a small bridge:

```ts
import { shallowRef } from "vue";
import type { Observable } from "@nexfetch/rest";

export function useObservable<T>(obs: Observable<T>) {
  const state = shallowRef(obs.get());
  obs.subscribe((v) => (state.value = v));
  return state;
}
```

## Migration from 0.x

| 0.x | 1.0 |
|---|---|
| `createApiClient` (from `/react`) | `createReactClient` (from `/react`) |
| `createApiClient` (from `/vanilla`) | `createClient` (from root) |
| `api.projects.useQuery("list", input)` | `client.useQuery(client.projects.list, input)` |
| `api.projects.useMutation("create")` | `client.useMutation(client.projects.create)` |
| `api.projects.useInfiniteQuery("list", opts)` | `client.useInfiniteQuery(client.projects.list, opts)` |
| `api.projects.query("list", input)` | `client.query(client.projects.list, input)` |
| `api.projects.mutation("create")` | `client.mutation(client.projects.create)` |
| `api.projects.fetch("list", input)` | `client.projects.list.call(input)` |
| `api.projects.list(input)` | `client.projects.list.call(input)` |
| `api.projects.invalidateByTag("tag")` | `client.cache.invalidateByTag("tag")` |
| `entry.$state.subscribe(fn)` | `query.state.subscribe(fn)` |
| `{ isPending, error }` | `{ status, error }` — `status` is `"idle" \| "pending" \| "success" \| "error"` |

## When to use this library

| Tool | Use when | Avoid when |
|---|---|---|
| `fetch` | Minimal needs, full control | You don't want to reimplement cache/dedupe/invalidation |
| `ky` | You want a small HTTP wrapper | You need cached reactive queries and tag invalidation |
| `@nexfetch/rest` | You want typed endpoints, explicit cache semantics, zero-dep reactivity, per-subscription select | You need mature devtools, SSR hydration, or TanStack's ecosystem |
| TanStack Query | Broadest feature set, biggest ecosystem | You want a smaller, opinionated layer |

## License

MIT
