export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class ValidationError extends Error {
  field: "body" | "query" | "params" | "response";
  cause: unknown;
  constructor(field: "body" | "query" | "params" | "response", cause: unknown) {
    super(`Validation failed for ${field}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "ValidationError";
    this.field = field;
    this.cause = cause;
  }
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
