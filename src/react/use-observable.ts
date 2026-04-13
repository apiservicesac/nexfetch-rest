import { useCallback, useSyncExternalStore } from "react";
import type { Observable } from "../core/observable";

export function useObservable<T>(obs: Observable<T>): T {
  return useSyncExternalStore(
    useCallback((cb) => obs.subscribe(cb), [obs]),
    () => obs.get(),
    () => obs.get(),
  );
}
