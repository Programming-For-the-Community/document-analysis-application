import crypto from 'crypto';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { DynamoDBConfig } from '../../interfaces/app';
import { Logger } from '../../utils/logger';

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let sessionId: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export async function writeSession(userSub: string, config: DynamoDBConfig): Promise<string> {
  sessionId = crypto.randomUUID();
  await AWS_DYNAMODB.writeSession(userSub, sessionId, config);
  Logger.info(`Session established for user ${userSub}: ${sessionId}`);
  return sessionId;
}

export function startHeartbeat(
  userSub: string,
  config: DynamoDBConfig,
  onInvalidated: () => void
): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    try {
      const stored = await AWS_DYNAMODB.getSessionId(userSub, config);
      if (stored !== sessionId) {
        Logger.warn(`Session invalidated for user ${userSub} — another device has logged in`);
        stopHeartbeat();
        onInvalidated();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`Session heartbeat error: ${message}`);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  sessionId = null;
}

export function getSessionId(): string | null {
  return sessionId;
}
