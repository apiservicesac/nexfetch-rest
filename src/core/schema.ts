/**
 * Validator-agnostic schema contract. Compatible with Zod, Valibot, Arktype,
 * or any object with a `.parse()` method.
 */
export interface Schema<T = unknown> {
  parse(data: unknown): T;
}
