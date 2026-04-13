/**
 * Stable hash of a value — keys of objects are sorted so two structurally
 * equal objects produce the same hash regardless of insertion order.
 */
export function stableHash(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableHash).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableHash(v)}`).join(",")}}`;
}

export function queryKeyOf(path: string[], input: unknown, extra?: unknown): string {
  const base = path.join(".");
  const inputHash = input === undefined ? "" : `:${stableHash(input)}`;
  const extraHash = extra === undefined ? "" : `#${stableHash(extra)}`;
  return `${base}${inputHash}${extraHash}`;
}
