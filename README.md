# @nexfetch/rest

Framework-agnostic REST API client with built-in cache, retry, deduplication, and optional schema validation.

Works with **React**, **Vue**, **Solid**, or **vanilla JS**.

## Install

```bash
npm install @nexfetch/rest
# or
bun add @nexfetch/rest
```

## Quick Start

### 1. Define your endpoints

```typescript
import { defineEndpoints } from "@nexfetch/rest";

const projectEndpoints = defineEndpoints({
  list: {
    path: "/api/projects",
    method: "GET",
    query: z.object({ orgId: z.string() }), // optional — works with Zod, Valibot, or any .parse()
    response: z.array(projectSchema),
  },
  create: {
    path: "/api/projects",
    method: "POST",
    body: z.object({ name: z.string(), description: z.string().optional() }),
    response: projectSchema,
    invalidate: ["projects.list"], // auto-invalidate after mutation
  },
  delete: {
    path: "/api/projects/:id",
    method: "DELETE",
    params: z.object({ id: z.string() }),
  },
});
```

### 2. Create the client

```typescript
import { createApiClient } from "@nexfetch/rest/react";

export const api = createApiClient({
  baseURL: "https://api.example.com",
  credentials: "include",
  cache: { staleTime: 30_000 },
  retry: { retries: 3 },
  endpoints: {
    projects: projectEndpoints,
  },
});
```

### 3. Use in components

```tsx
function ProjectList() {
  const { data, isPending, error, isFetching } = api.projects.useQuery("list", { orgId: "abc" });

  if (isPending) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}

function CreateProject() {
  const create = api.projects.useMutation("create");

  return (
    <button
      disabled={create.isPending}
      onClick={() => create.mutate({ name: "New project" })}
    >
      {create.isPending ? "Creating..." : "Create"}
    </button>
  );
}
```

## Features

### Cache

Queries are cached by a unique key generated from namespace + endpoint + input. Two components calling the same query share the same cache entry.

```typescript
// Both components share the same cache entry and fetch only once
api.projects.useQuery("list", { orgId: "abc" });
api.projects.useQuery("list", { orgId: "abc" }); // cache hit — no extra fetch
```

### Stale-While-Revalidate

When data becomes stale, the old data stays visible while a background refetch happens.

```typescript
const api = createApiClient({
  cache: { staleTime: 30_000 }, // data is fresh for 30 seconds
  endpoints: { ... },
});

// Per-endpoint override:
const endpoints = defineEndpoints({
  list: { path: "/api/items", method: "GET", staleTime: 60_000 },
});
```

### Automatic Invalidation

Mutations auto-invalidate related queries:

```typescript
const endpoints = defineEndpoints({
  list: { path: "/api/items", method: "GET" },
  create: {
    path: "/api/items",
    method: "POST",
    invalidate: ["items.list"], // refetches all "items.list" queries after mutation
  },
});
```

If no `invalidate` is specified, mutations invalidate all queries in the same namespace by default.

### Retry

Failed requests are retried automatically with exponential backoff.

```typescript
const api = createApiClient({
  retry: {
    retries: 3,            // max retry attempts (default: 2)
    retryDelay: 1000,      // base delay in ms (default: 1000)
    retryOn: [408, 500, 502, 503, 504], // HTTP status codes to retry
  },
  endpoints: { ... },
});
```

### Request Deduplication

Concurrent identical GET requests are deduplicated — only one network request is made.

### Garbage Collection

Cache entries without active subscribers are automatically cleaned up after `gcTime` (default: 5 minutes).

```typescript
const api = createApiClient({
  cache: { gcTime: 10 * 60 * 1000 }, // 10 minutes
  endpoints: { ... },
});
```

### Refetch on Focus

Optionally refetch stale queries when the browser tab regains focus.

```typescript
const api = createApiClient({
  cache: { refetchOnFocus: true },
  endpoints: { ... },
});
```

## Schema Validation (Optional)

Schemas are optional and validator-agnostic. Any object with a `.parse()` method works:

```typescript
// With Zod
import { z } from "zod";
defineEndpoints({
  list: { path: "/api/items", method: "GET", response: z.array(itemSchema) },
});

// With Valibot
import * as v from "valibot";
defineEndpoints({
  list: { path: "/api/items", method: "GET", response: v.parser(v.array(itemSchema)) },
});

// Without validation
defineEndpoints({
  list: { path: "/api/items", method: "GET" }, // response type is `unknown`
});
```

## Direct Fetch (No Hooks)

Call endpoints directly without hooks — returns a plain Promise:

```typescript
const projects = await api.projects.list({ query: { orgId: "abc" } });
const created = await api.projects.create({ body: { name: "New" } });
await api.projects.delete({ params: { id: "123" } });
```

## Path Parameters

Use `:param` in paths — they're interpolated from `params`:

```typescript
defineEndpoints({
  detail: { path: "/api/projects/:id", method: "GET", params: z.object({ id: z.string() }) },
  update: { path: "/api/projects/:id", method: "PUT", params: z.object({ id: z.string() }), body: updateSchema },
});

// Usage:
api.projects.detail({ params: { id: "123" } });
```

## Framework Adapters

### React

```typescript
import { createApiClient } from "@nexfetch/rest/react";
```

Uses `useSyncExternalStore` under the hood. Works with React 18+.

### Vue (coming soon)

```typescript
import { createApiClient } from "@nexfetch/rest/vue";
```

### Vanilla JS

```typescript
import { createApiClient } from "@nexfetch/rest/vanilla";

const api = createApiClient({ ... });
const entry = api.projects.query("list", { orgId: "abc" });

// Subscribe to state changes
entry.$state.subscribe((state) => {
  console.log(state.data, state.isPending, state.error);
});

// Mutations
const mutation = api.projects.mutation("create");
await mutation.mutate({ name: "New" });

// Direct fetch
await api.projects.fetch("list", { query: { orgId: "abc" } });

// Invalidate
api.projects.invalidate("list");
```

## API Reference

### `defineEndpoints(endpoints)`

Define a set of typed endpoints. Each endpoint can have:

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | URL path (supports `:param` interpolation) |
| `method` | `"GET" \| "POST" \| "PUT" \| "DELETE" \| "PATCH"` | HTTP method |
| `body` | `Schema` | Request body schema (optional) |
| `query` | `Schema` | Query parameters schema (optional) |
| `params` | `Schema` | Path parameters schema (optional) |
| `response` | `Schema` | Response validation schema (optional) |
| `headers` | `Record<string, string>` | Extra headers (optional) |
| `staleTime` | `number` | Override cache stale time in ms (optional) |
| `invalidate` | `string[]` | Cache keys to invalidate on mutation (optional) |

### `createApiClient(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseURL` | `string` | — | Base URL for all requests |
| `credentials` | `RequestCredentials` | — | Fetch credentials mode |
| `headers` | `Record<string, string>` | — | Global headers |
| `endpoints` | `NamespacedEndpoints` | — | Endpoint definitions by namespace |
| `cache.staleTime` | `number` | `0` | Default stale time (ms) |
| `cache.gcTime` | `number` | `300000` | GC timeout for unused entries (ms) |
| `cache.refetchOnFocus` | `boolean` | `false` | Refetch stale on window focus |
| `retry.retries` | `number` | `2` | Max retry attempts |
| `retry.retryDelay` | `number` | `1000` | Base retry delay (ms) |
| `retry.retryOn` | `number[]` | `[408,500,502,503,504]` | Status codes to retry |
| `onError` | `(error: ApiError) => void` | — | Global error handler |

## License

MIT
