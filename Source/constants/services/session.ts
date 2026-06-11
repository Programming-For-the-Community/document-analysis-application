export const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
export const TOKEN_REFRESH_THRESHOLD_MS = 50 * 60 * 1000; // refresh Cognito tokens after 50 min
export const MAX_REFRESH_FAILURES = 3; // force logout after this many consecutive Cognito refresh failures
