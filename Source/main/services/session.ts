import crypto from 'node:crypto';

import { AWS_DYNAMODB } from '../../classes/aws/dynamodb';
import { AWS_STS } from '../../classes/aws/sts';
import { AWS_COGNITO } from '../../classes/aws/cognito';
import { DynamoDBConfig } from '../../interfaces/config';
import { HeartbeatOptions } from '../../interfaces/services/session';
import {
  HEARTBEAT_INTERVAL_MS,
  TOKEN_REFRESH_THRESHOLD_MS,
  MAX_REFRESH_FAILURES,
} from '../../constants/services/session';
import { getDeviceId } from './device';
import { Logger } from '../../utils/logger';

let sessionId: string | null = null;
let tokenIssuedAt = 0;
let consecutiveRefreshFailures = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export async function writeSession(userSub: string, config: DynamoDBConfig): Promise<string> {
  sessionId = crypto.randomUUID();
  const deviceId = getDeviceId();
  await AWS_DYNAMODB.writeSession(userSub, sessionId, deviceId, config);
  tokenIssuedAt = Date.now();
  Logger.info(`Session established for user ${userSub} on device ${deviceId}: ${sessionId}`);
  return sessionId;
}

// Refreshes Cognito tokens once they near the 1-hour expiry. Returns false if
// refresh has failed too many times and the session was invalidated.
async function refreshTokensIfDue(opts: HeartbeatOptions): Promise<boolean> {
  if (Date.now() - tokenIssuedAt <= TOKEN_REFRESH_THRESHOLD_MS) return true;
  const refreshToken = opts.getRefreshToken();
  if (!refreshToken) return true;

  try {
    const fresh = await AWS_COGNITO.refreshTokens(refreshToken, opts.cognitoConfig);
    if (fresh) {
      opts.setTokens(fresh);
      tokenIssuedAt = Date.now();
      consecutiveRefreshFailures = 0;
    }
    return true;
  } catch (err) {
    consecutiveRefreshFailures++;
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(
      `Cognito token refresh failed (${consecutiveRefreshFailures}/${MAX_REFRESH_FAILURES}): ${message}`
    );
    if (consecutiveRefreshFailures < MAX_REFRESH_FAILURES) return true;

    Logger.error('Cognito refresh failed too many times — invalidating session');
    stopHeartbeat();
    opts.onInvalidated();
    return false;
  }
}

// Only one device may be active per account, so a fingerprint mismatch means
// the user signed in elsewhere and this session should be logged out.
async function validateActiveDevice(opts: HeartbeatOptions, myDeviceId: string): Promise<void> {
  const stored = await AWS_DYNAMODB.getSession(opts.userSub, opts.dbConfig);
  if (stored?.deviceId !== myDeviceId) {
    Logger.warn(
      `Session invalidated for user ${opts.userSub} — active device is ${stored?.deviceId ?? 'unknown'}, this device is ${myDeviceId}`
    );
    stopHeartbeat();
    opts.onInvalidated();
    return;
  }
  Logger.debug(
    `Heartbeat OK for user ${opts.userSub} (device: ${myDeviceId}, session: ${sessionId ?? 'none'})`
  );
}

async function heartbeatTick(opts: HeartbeatOptions, myDeviceId: string): Promise<void> {
  try {
    // 1. Refresh STS credentials if expiring within 5 minutes
    await AWS_STS.maybeRefresh();
    // 2. Refresh Cognito tokens if they're nearing expiry
    if (!(await refreshTokensIfDue(opts))) return;
    // 3. Validate session via device fingerprint
    await validateActiveDevice(opts, myDeviceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`Session heartbeat error: ${message}`);
  }
}

export function startHeartbeat(opts: HeartbeatOptions): void {
  stopHeartbeat();
  consecutiveRefreshFailures = 0;
  const myDeviceId = getDeviceId();

  heartbeatTimer = setInterval(() => void heartbeatTick(opts, myDeviceId), HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function clearSession(): void {
  sessionId = null;
}

export function getSessionId(): string | null {
  return sessionId;
}
