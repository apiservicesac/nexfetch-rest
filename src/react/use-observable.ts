import { useCallback, useSyncExternalStore } from "react";
import type { Observable } from "../core/observable";

export function useObservable<T>(obs: Observable<T>): T;
export function useObservable<T>(obs: Observable<T> | null): T | undefined;
export function useObservable<T>(obs: Observable<T> | null): T | undefined {
  return useSyncExternalStore(
    useCallback((cb) => obs?.subscribe(cb) ?? noop, [obs]),
    () => obs?.get(),
    () => obs?.get(),
  );
}

const noop = () => {};
