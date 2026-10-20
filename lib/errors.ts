import { ConvexError } from "convex/values";

export type AppError = { message: string; field?: string; code?: string };

/** Reads the `{ code, message, field }` payload thrown by Convex functions. */
export function readError(
  error: unknown,
  fallback = "Something went wrong",
): AppError {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string") return { message: data };
    if (data && typeof data === "object" && "message" in data) {
      const { message, field, code } = data as AppError;
      return { message, field, code };
    }
  }
  return { message: fallback };
}
