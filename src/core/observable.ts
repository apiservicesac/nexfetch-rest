/**
 * Minimal reactive primitive. Internal contract — adapters bridge this to
 * framework-native reactivity (React's useSyncExternalStore, Vue's shallowRef, etc.).
 */
export interface Observable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export interface WritableObservable<T> extends Observable<T> {
  set(value: T): void;
  update(fn: (prev: T) => T): void;
}

export function observable<T>(initial: T): WritableObservable<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get: () => value,
    set(next: T) {
      if (Object.is(value, next)) return;
      value = next;
      for (const l of listeners) l(value);
    },
    update(fn) {
      this.set(fn(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/**
 * Derived observable that transforms the source value. New subscribers receive
 * the current derived value immediately via `get()`.
 */
export function derived<T, U>(source: Observable<T>, map: (value: T) => U): Observable<U> {
  return {
    get: () => map(source.get()),
    subscribe(listener) {
      return source.subscribe((v) => listener(map(v)));
    },
  };
}
