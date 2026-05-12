/**
 * Returns a user-facing error string.
 *
 * AWS SDK errors expose internal ARNs and policy details that should never
 * reach the UI. They're detected by the presence of `$metadata` (added by
 * every @aws-sdk command response). Application-level errors thrown by our
 * own code are plain Error objects without that property and can be shown
 * verbatim because they already carry user-meaningful messages.
 */
export function userFacingError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if ('$metadata' in err) return fallback;
    return err.message;
  }
  return fallback;
}
