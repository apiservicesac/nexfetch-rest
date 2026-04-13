/**
 * Vue adapter — placeholder.
 *
 * Native Vue composables (useQuery/useMutation backed by shallowRef) are not
 * implemented yet. For now, use the vanilla client and subscribe to
 * `query.state` / `mutation.state` manually, or bridge Observable<T> into
 * a `shallowRef` inside your own composable.
 */
export { createClient } from "../core/client";
export type { VanillaClient } from "../core/client";
