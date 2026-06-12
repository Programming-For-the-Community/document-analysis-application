export function parseJwt(token: string): Record<string, unknown> {
  // JWT payloads are base64url, not standard base64 — swap the URL-safe
  // characters back before atob() can decode them.
  const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  return JSON.parse(atob(base64)) as Record<string, unknown>;
}
