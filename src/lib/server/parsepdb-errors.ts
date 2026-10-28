const DB_DOWN_CODES = new Set([
  "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH",
  "P1001", "P1002", "P1017",
  "57P01", "57P03",
]);

export function isDbUnavailable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;

  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && DB_DOWN_CODES.has(code)) return true;

  const nested = (err as { errors?: unknown }).errors;   // AggregateError
  if (Array.isArray(nested)) return nested.some(isDbUnavailable);

  return false;
}