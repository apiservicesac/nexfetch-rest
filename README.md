# @nexfetch/rest

Framework-agnostic REST API client with built-in cache, retry, deduplication, tag-based invalidation, and optional schema validation.

Works with **React**, **Vue**, or **vanilla JS**. Zero dependency on any validation library.

## Install

```bash
npm install @nexfetch/rest
```

## Quick Start

### 1. Define endpoints

```typescript
import { defineEndpoints } from "@nexfetch/rest";
import { z } from "zod"; // optional — any validator with .parse() works

const projectEndpoints = defineEndpoints({
  list: {
    path: "/api/projects",
    method: "GET",
    query: z.object({ orgId: z.string() }),
    response: z.array(projectSchema),
    tags: ["projects"],
  },
  get: {
    path: "/api/projects/:id",
    method: "GET",
    params: z.object({ id: z.string() }),
    tags: ["projects"],
  },
  create: {
    path: "/api/projects",
    method: "POST",
    body: z.object({ name: z.string() }),
    response: projectSchema,
    invalidates: ["projects"],
  },
  delete: {
    path: "/api/projects/:id",
    method: "DELETE",
    params: z.object({ id: z.string() }),
    invalidates: ["projects"],
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
  const { data, isPending } = api.projects.useQuery("list", { query: { orgId: "abc" } });

  if (isPending) return <p>Loading...</p>;
  return <ul>{data?.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}

function CreateProject() {
  const create = api.projects.useMutation("create");

  return (
    <button
      disabled={create.isPending}
      onClick={() => create.mutate(
        { body: { name: "New project" } },
        { onSuccess: (data) => console.log("Created:", data.id) },
      )}
    >
      {create.isPending ? "Creating..." : "Create"}
    </button>
  );
}
```

## Features

### Unified Input Format

All hooks use the same `{ body?, query?, params? }` format:

```typescript
// GET with query params
api.projects.useQuery("list", { query: { orgId: "abc" } });

// GET with path params
api.projects.useQuery("get", { params: { id: "123" } });

// POST with body
create.mutate({ body: { name: "New" } });

// DELETE with path params
del.mutate({ params: { id: "123" } });

// PUT with body + path params
update.mutate({ params: { id: "123" }, body: { name: "Updated" } });
```

### Cache & Deduplication

Queries are cached by key (namespace + endpoint + input). Two components with the same query share one cache entry and one network request.

### Stale-While-Revalidate

Old data stays visible while background refetch happens. Configure globally or per-endpoint:

```typescript
// Global
createApiClient({ cache: { staleTime: 30_000 }, ... });

// Per-endpoint
defineEndpoints({ list: { ..., staleTime: 60_000 } });
```

### Tag-Based Invalidation

Queries declare `tags`. Mutations declare `invalidates`. After a mutation succeeds, all queries with matching tags are refetched.

```typescript
defineEndpoints({
  members: { method: "GET", path: "/api/members", tags: ["members"] },
  addMember: { method: "POST", path: "/api/members", invalidates: ["members"] },
});
// After addMember.mutate() succeeds → all "members" queries refetch automatically
```

### Mutation Callbacks

```typescript
const create = api.projects.useMutation("create");

await create.mutate(
  { body: { name: "New" } },
  {
    onSuccess: (data) => navigate(`/projects/${data.id}`),
    onError: (err) => toast.error(err.message),
  },
);
```

### Polling (refetchInterval)

```typescript
api.activities.useQuery("list", { params: { id } }, { refetchInterval: 10_000 });
```

### Response Transform

Normalize backend responses at the endpoint level. Runs before the data reaches the cache:

```typescript
defineEndpoints({
  list: {
    path: "/api/notifications",
    method: "GET",
    transform: (raw) => (raw as { data: Notification[] }).data, // unwrap .data
  },
});
```

### Select (UI Transform)

Transform cached data per-component without affecting the cache:

```typescript
const { data } = api.notifications.useQuery("list", undefined, {
  select: (data) => (data as Notification[]).filter((n) => !n.read),
});
```

### Infinite Query (Pagination)

Composable hook for scroll-based pagination. Supports 3 strategies — just declare the type:

**Offset pagination** (page numbers):
```typescript
const repos = api.git.useInfiniteQuery("repos", {
  query: { provider: "github" },
  pagination: { type: "offset", pageSize: 100 },
});
// hasMore = lastPage.length >= 100, auto-increments ?page=N
```

**Cursor pagination** (token-based):
```typescript
const items = api.items.useInfiniteQuery("list", {
  pagination: { type: "cursor", cursorField: "nextCursor" },
});
// Reads nextCursor from response, passes as ?cursor=X on next fetch
```

**Total-count pagination** (server tells total):
```typescript
const items = api.items.useInfiniteQuery("list", {
  pagination: { type: "total", totalField: "total", pageSize: 20 },
});
// hasMore = currentPage < ceil(total / pageSize)
```

**All return the same interface:**
```typescript
repos.data            // flat array of all pages
repos.pages           // array of page arrays
repos.fetchNext()     // load next page
repos.hasMore         // boolean
repos.isFetchingMore  // boolean
repos.isPending       // true during first page load
```

### Retry

Failed requests retry with exponential backoff:

```typescript
createApiClient({
  retry: { retries: 3, retryDelay: 1000, retryOn: [408, 500, 502, 503, 504] },
  ...
});
```

### Garbage Collection

Unused cache entries are removed after `gcTime` (default: 5 minutes). Entries are "unused" when no component subscribes to them.

### Refetch on Focus

Optionally refetch stale queries when the browser tab regains focus:

```typescript
createApiClient({ cache: { refetchOnFocus: true }, ... });
```

### Direct Fetch

Call endpoints without hooks — returns a plain Promise:

```typescript
const projects = await api.projects.list({ query: { orgId: "abc" } });
await api.projects.delete({ params: { id: "123" } });
```

## Schema Validation

Schemas are optional. Any object with `.parse()` works — Zod, Valibot, Arktype, or custom:

```typescript
// With Zod
response: z.array(itemSchema)

// Without validation (response is `unknown`)
{ path: "/api/items", method: "GET" }
```

## Framework Adapters

### React

```typescript
import { createApiClient } from "@nexfetch/rest/react";
```

Uses `useSyncExternalStore`. Requires React 18+.

### Vanilla JS

```typescript
import { createApiClient } from "@nexfetch/rest/vanilla";

const api = createApiClient({ ... });
const entry = api.projects.query("list", { query: { orgId: "abc" } });
entry.$state.subscribe((state) => console.log(state.data));

const mutation = api.projects.mutation("create");
await mutation.mutate({ body: { name: "New" } });
```

### Vue

```typescript
import { createApiClient } from "@nexfetch/rest/vue";
```

Currently uses the vanilla adapter. Native Vue composables coming soon.

## API Reference

### Endpoint Definition

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | URL path with `:param` interpolation |
| `method` | `"GET" \| "POST" \| "PUT" \| "DELETE" \| "PATCH"` | HTTP method |
| `body` | `Schema` | Request body schema (optional) |
| `query` | `Schema` | Query params schema (optional) |
| `params` | `Schema` | Path params schema (optional) |
| `response` | `Schema` | Response validation schema (optional) |
| `headers` | `Record<string, string>` | Extra headers (optional) |
| `staleTime` | `number` | Cache stale time in ms (optional) |
| `tags` | `string[]` | Cache tags for invalidation (optional) |
| `invalidates` | `string[]` | Tags to invalidate on mutation success (optional) |
| `transform` | `(raw: unknown) => unknown` | Normalize response before caching (optional) |

### Client Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseURL` | `string` | — | Base URL for all requests |
| `credentials` | `RequestCredentials` | — | Fetch credentials mode |
| `headers` | `Record<string, string>` | — | Global headers |
| `endpoints` | `NamespacedEndpoints` | — | Endpoint definitions by namespace |
| `cache.staleTime` | `number` | `0` | Default stale time (ms) |
| `cache.gcTime` | `number` | `300000` | GC time for unused entries (ms) |
| `cache.refetchOnFocus` | `boolean` | `false` | Refetch stale on tab focus |
| `retry.retries` | `number` | `2` | Max retry attempts |
| `retry.retryDelay` | `number` | `1000` | Base retry delay (ms) |
| `retry.retryOn` | `number[]` | `[408,500,502,503,504]` | Status codes to retry |
| `onError` | `(error: ApiError) => void` | — | Global error handler |

### Query Options

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | `boolean` | Enable/disable the query (default: `true`) |
| `refetchInterval` | `number` | Polling interval in ms (optional) |
| `select` | `(data: unknown) => unknown` | Transform data per-component (optional) |

## License

MIT
