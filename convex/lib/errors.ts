import { ConvexError } from "convex/values";

export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "rate_limited"
  | "unavailable";

export type AppErrorData = { code: ErrorCode; message: string; field?: string };

export function fail(code: ErrorCode, message: string, field?: string): never {
  throw new ConvexError<AppErrorData>(
    field ? { code, message, field } : { code, message },
  );
}

export function invalid(field: string, message: string): never {
  return fail("invalid", message, field);
}

export function notFound(what: string): never {
  return fail("not_found", `${what} not found`);
}
