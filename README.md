# @nexfetch/rest

Lightweight REST client with endpoint-level typing, cache, retry, GET deduplication, and tag-based invalidation.

Current support:

- React with hooks (`@nexfetch/rest/react`)
- Vanilla JS with `nanostores` (`@nexfetch/rest/vanilla`)
- Vue export (`@nexfetch/rest/vue`) as a compatibility layer over the vanilla adapter; it does not provide native Vue composables yet

## Install

```bash
npm install @nexfetch/rest
```

## Quick Start

### 1. Define endpoints

```ts
import { defineEndpoints } from "@nexfetch/rest";
import { z } from "zod";

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const projectEndpoints = defineEndpoints({
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
});
```

### 2. Create the client

```ts
import { createApiClient } from "@nexfetch/rest/react";
import { projectEndpoints } from "./projects.endpoints";

export const api = createApiClient({
  baseURL: "https://api.example.com",
  credentials: "include",
  cache: { staleTime: 30_000, refetchOnFocus: true },
  retry: { retries: 3 },
  endpoints: {
    projects: projectEndpoints,
  },
});
```

### 3. Use it in React

```tsx
function ProjectList() {
  const { data, isPending, error } = api.projects.useQuery("list", {
    query: { orgId: "acme" },
  });

  if (isPending) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  return <ul>{data?.map((project) => <li key={project.id}>{project.name}</li>)}</ul>;
}

function CreateProjectButton() {
  const createProject = api.projects.useMutation("create");

  return (
    <button
      disabled={createProject.isPending}
      onClick={() => createProject.mutate({ body: { name: "New project" } })}
    >
      {createProject.isPending ? "Creating..." : "Create project"}
    </button>
  );
}
```

## API shape

All endpoints use the same input shape:

```ts
type FetchInput = {
  body?: unknown;
  query?: unknown;
  params?: Record<string, string>;
};
```

Examples:

```ts
api.projects.useQuery("list", { query: { orgId: "acme" } });
api.projects.useQuery("get", { params: { id: "p_123" } });

const createProject = api.projects.useMutation("create");
await createProject.mutate({ body: { name: "Portal" } });

await api.projects.remove({ params: { id: "p_123" } });
```

## Current capabilities

### Cache and deduplication

- Queries are cached by `namespace + endpoint + input`
- Two identical GET requests share the same in-flight request
- `staleTime` can be configured globally or per endpoint
- Entries with no subscribers are removed after `gcTime`

```ts
createApiClient({
  cache: {
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnFocus: true,
  },
  endpoints,
  baseURL: "https://api.example.com",
});
```

### Tag-based invalidation

Queries can declare `tags` and mutations can declare `invalidates`. When a mutation succeeds, those tags are invalidated and active queries are fetched again.

```ts
const members = defineEndpoints({
  list: {
    path: "/members",
    method: "GET",
    tags: ["members"],
  },
  create: {
    path: "/members",
    method: "POST",
    invalidates: ["members"],
  },
});
```

### Retry

Requests use exponential backoff for the configured status codes.

```ts
createApiClient({
  baseURL: "https://api.example.com",
  endpoints,
  retry: {
    retries: 3,
    retryDelay: 1000,
    retryOn: [408, 500, 502, 503, 504],
  },
});
```

### Polling

`useQuery` in React supports `refetchInterval`.

```ts
api.projects.useQuery("list", { query: { orgId: "acme" } }, { refetchInterval: 10_000 });
```

### Infinite query

`useInfiniteQuery` currently exists only in the React adapter and supports:

- `offset`
- `cursor`
- `total`

```ts
const repos = api.projects.useInfiniteQuery("list", {
  query: { orgId: "acme" },
  pagination: { type: "offset", pageSize: 20 },
});

await repos.fetchNext();
```

### Direct fetch without hooks

You can also call endpoints directly and get a plain `Promise`.

```ts
const projects = await api.projects.list({ query: { orgId: "acme" } });
await api.projects.remove({ params: { id: "p_123" } });
```

## Schemas: what they validate today

The schema system is validator-agnostic: any object with a `.parse()` method works.

```ts
import { z } from "zod";

response: z.array(projectSchema);
```

Current runtime validation behavior:

- `response`: if present, `schema.parse(data)` runs against the received JSON
- `body`: contributes TypeScript types, but is not automatically validated before sending the request
- `query`: contributes TypeScript types, but is not automatically validated before building the URL
- `params`: contributes TypeScript types, but is not automatically validated before interpolating the path

In practice, current runtime validation is concentrated on `response`.

## Transform and select

`transform` exists at the endpoint level and runs before the final value is stored in cache.

```ts
const notifications = defineEndpoints({
  list: {
    path: "/notifications",
    method: "GET",
    transform: (data) => (data as { data: unknown[] }).data,
  },
});
```

Important notes:

- If you also define `response`, the response is parsed first and `transform` runs after that
- In `useQuery`, the current `select` behavior is applied when the cache entry for that key is created, so it should not be treated as an isolated per-component projection

## Adapters

### React

```ts
import { createApiClient } from "@nexfetch/rest/react";
```

This is the most complete adapter today. It includes:

- `useQuery`
- `useMutation`
- `useInfiniteQuery`
- direct endpoint calls

### Vanilla

```ts
import { createApiClient } from "@nexfetch/rest/vanilla";
```

It exposes:

- `query(key, input)` to get a cached `nanostores` entry
- `mutation(key)` to run mutations
- `fetch(key, input)` for direct requests
- `invalidateByTag(tag)` for manual invalidation

```ts
const api = createApiClient({
  baseURL: "https://api.example.com",
  endpoints: { projects: projectEndpoints },
});

const entry = api.projects.query("list", { query: { orgId: "acme" } });
const unsubscribe = entry.$state.subscribe((state) => {
  console.log(state.data, state.isFetching);
});

const createProject = api.projects.mutation("create");
await createProject.mutate({ body: { name: "Portal" } });

unsubscribe();
```

### Vue

```ts
import { createApiClient } from "@nexfetch/rest/vue";
```

Today this export reuses the vanilla adapter. It works as a compatible entry point, but it does not provide native Vue composables yet.

There is no public Solid support in this package today.

## When to use this library

| Tool | Use it when | Avoid it when |
|---|---|---|
| `fetch` | You want full control and your cache, retry, and invalidation needs are minimal or fully custom | You do not want to hand-roll wrappers, error handling, deduplication, and invalidation |
| `ky` | You want a small HTTP wrapper with good request DX and you are comfortable building data hooks on top | You need declarative cache, tag invalidation, and ready-made hooks |
| `@nexfetch/rest` | You want something more structured than `fetch` or `ky`, with typed endpoints, simple cache, and invalidation, without moving into a heavier stack | You need advanced server-state workflows, mature devtools, strong SSR or hydration support, or a larger ecosystem |
| TanStack Query | You need the broadest server-state feature set, ecosystem, and advanced patterns | You want a smaller, more opinionated layer for CRUD apps or dashboards |

## API Reference

### Endpoint definition

| Field | Type | Description |
|---|---|---|
| `path` | `string` | URL path with `:param` interpolation |
| `method` | `"GET" \| "POST" \| "PUT" \| "DELETE" \| "PATCH"` | HTTP method |
| `body` | `Schema` | Schema used for body type inference |
| `query` | `Schema` | Schema used for query type inference |
| `params` | `Schema` | Schema used for path param type inference |
| `response` | `Schema` | Schema used to parse and validate the response |
| `headers` | `Record<string, string>` | Extra headers |
| `staleTime` | `number` | Per-endpoint staleness in ms |
| `tags` | `string[]` | Tags attached to queries |
| `invalidates` | `string[]` | Tags to invalidate after mutation success |
| `transform` | `(raw: unknown) => unknown` | Transformation applied before writing to cache |

### Client options

| Option | Type | Default |
|---|---|---|
| `baseURL` | `string` | required |
| `credentials` | `RequestCredentials` | `undefined` |
| `headers` | `Record<string, string>` | `undefined` |
| `endpoints` | `NamespacedEndpoints` | required |
| `cache.staleTime` | `number` | `0` |
| `cache.gcTime` | `number` | `300000` |
| `cache.refetchOnFocus` | `boolean` | `false` |
| `retry.retries` | `number` | `2` |
| `retry.retryDelay` | `number` | `1000` |
| `retry.retryOn` | `number[]` | `[408, 500, 502, 503, 504]` |
| `onError` | `(error: ApiError) => void` | `undefined` |

### React query options

| Option | Type | Description |
|---|---|---|
| `enabled` | `boolean` | Enables or disables the query |
| `refetchInterval` | `number` | Polling interval in ms |
| `select` | `(data: unknown) => unknown` | Projection applied to the value associated with that cache key |

## License

MIT
