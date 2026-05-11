import crypto from 'crypto';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_STS } from '../../aws/sts';
import { AWS_COGNITO } from '../../aws/cognito';
import { CognitoCredentials } from '../../interfaces/aws';
import { DynamoDBConfig, CognitoConfig } from '../../interfaces/app';
import { getDeviceId } from './device';
import { Logger } from '../../utils/logger';

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;  // 2 minutes
const TOKEN_REFRESH_THRESHOLD_MS = 50 * 60 * 1000; // refresh Cognito tokens after 50 min
const MAX_REFRESH_FAILURES = 3; // force logout after this many consecutive Cognito refresh failures

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

export interface HeartbeatOptions {
  userSub: string;
  dbConfig: DynamoDBConfig;
  cognitoConfig: CognitoConfig;
  getRefreshToken: () => string | null;
  setTokens: (tokens: CognitoCredentials) => void;
  onInvalidated: () => void;
}

export function startHeartbeat(opts: HeartbeatOptions): void {
  stopHeartbeat();
  consecutiveRefreshFailures = 0;
  const myDeviceId = getDeviceId();

  heartbeatTimer = setInterval(() => {
    void (async () => {
      try {
        // 1. Refresh STS credentials if expiring within 5 minutes
        await AWS_STS.maybeRefresh();

        // 2. Refresh Cognito tokens if they're nearing the 1-hour expiry
        if (Date.now() - tokenIssuedAt > TOKEN_REFRESH_THRESHOLD_MS) {
          const refreshToken = opts.getRefreshToken();
          if (refreshToken) {
            try {
              const fresh = await AWS_COGNITO.refreshTokens(refreshToken, opts.cognitoConfig);
              if (fresh) {
                opts.setTokens(fresh);
                tokenIssuedAt = Date.now();
                consecutiveRefreshFailures = 0;
              }
            } catch (err) {
              consecutiveRefreshFailures++;
              const message = err instanceof Error ? err.message : String(err);
              Logger.error(
                `Cognito token refresh failed (${consecutiveRefreshFailures}/${MAX_REFRESH_FAILURES}): ${message}`
              );
              if (consecutiveRefreshFailures >= MAX_REFRESH_FAILURES) {
                Logger.error('Cognito refresh failed too many times — invalidating session');
                stopHeartbeat();
                opts.onInvalidated();
                return;
              }
            }
          }
        }

        // 3. Validate session via device fingerprint
        const stored = await AWS_DYNAMODB.getSession(opts.userSub, opts.dbConfig);
        if (!stored || stored.deviceId !== myDeviceId) {
          Logger.warn(
            `Session invalidated for user ${opts.userSub} — active device is ${stored?.deviceId ?? 'unknown'}, this device is ${myDeviceId}`
          );
          stopHeartbeat();
          opts.onInvalidated();
        } else {
          Logger.debug(`Heartbeat OK for user ${opts.userSub} (device: ${myDeviceId}, session: ${sessionId ?? 'none'})`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error(`Session heartbeat error: ${message}`);
      }
    })();
  }, HEARTBEAT_INTERVAL_MS);
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
