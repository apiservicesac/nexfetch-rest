import type { Observable } from "./observable";
import { observable } from "./observable";
import type { MutationOptions, MutationState } from "./types";
import type { EndpointNode } from "./endpoint";
import type { QueryCache } from "./cache";
import { toError } from "./errors";

const INITIAL: MutationState<unknown> = {
  data: undefined,
  error: undefined,
  status: "idle",
};

export class Mutation<I, O> {
  private readonly $state = observable<MutationState<O>>({ ...(INITIAL as MutationState<O>) });

  constructor(
    private readonly endpoint: EndpointNode<I, O>,
    private readonly cache: QueryCache,
    private readonly opts?: MutationOptions<I, O>,
  ) {}

  get state(): Observable<MutationState<O>> {
    return this.$state;
  }

  async mutate(input: I, perCall?: MutationOptions<I, O>): Promise<O> {
    this.$state.set({ data: undefined, error: undefined, status: "pending" });
    try {
      const data = await this.endpoint.call(input);
      this.$state.set({ data, error: undefined, status: "success" });
      for (const tag of this.endpoint.def.invalidates ?? []) {
        this.cache.invalidateByTag(tag);
      }
      this.opts?.onSuccess?.(data, input);
      perCall?.onSuccess?.(data, input);
      return data;
    } catch (error) {
      const err = toError(error);
      this.$state.set({ data: undefined, error: err, status: "error" });
      this.opts?.onError?.(err, input);
      perCall?.onError?.(err, input);
      throw err;
    }
  }

  reset(): void {
    this.$state.set({ ...(INITIAL as MutationState<O>) });
  }
}

export function createMutation<I, O>(
  endpoint: EndpointNode<I, O>,
  cache: QueryCache,
  opts?: MutationOptions<I, O>,
): Mutation<I, O> {
  return new Mutation(endpoint, cache, opts);
}
