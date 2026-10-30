import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearSession,
  getSessionId,
  startHeartbeat,
  stopHeartbeat,
  writeSession,
} from '../../../main/services/session';
import { getDeviceId } from '../../../main/services/device';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { AWS_STS } from '../../../classes/aws/sts';
import { AWS_COGNITO } from '../../../classes/aws/cognito';
import { HeartbeatOptions } from '../../../interfaces/services/session';
import { Logger } from '../../../utils/logger';
import {
  HEARTBEAT_INTERVAL_MS,
  MAX_REFRESH_FAILURES,
  TOKEN_REFRESH_THRESHOLD_MS,
} from '../../../constants/services/session';
import { makeConfig } from '../../helpers';

vi.mock('../../../main/services/device', () => ({ getDeviceId: vi.fn() }));

const config = makeConfig();

function makeOpts(overrides: Partial<HeartbeatOptions> = {}): HeartbeatOptions {
  return {
    userSub: 'user-sub',
    dbConfig: config.dynamoDB,
    cognitoConfig: config.cognito,
    getRefreshToken: () => 'refresh-token',
    setTokens: vi.fn(),
    onInvalidated: vi.fn(),
    ...overrides,
  };
}

const tick = () => vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

describe('session', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.mocked(getDeviceId).mockReturnValue('this-device');
    vi.spyOn(AWS_DYNAMODB, 'writeSession').mockResolvedValue();
    vi.spyOn(AWS_DYNAMODB, 'getSession').mockResolvedValue({
      sessionId: 's',
      deviceId: 'this-device',
    });
    vi.spyOn(AWS_STS, 'maybeRefresh').mockResolvedValue();
    vi.spyOn(AWS_COGNITO, 'refreshTokens').mockResolvedValue({
      accessToken: 'a2',
      idToken: 'i2',
      refreshToken: 'r',
    });
    await writeSession('user-sub', config.dynamoDB);
  });

  afterEach(() => {
    stopHeartbeat();
    clearSession();
    vi.useRealTimers();
  });

  it('writes a fresh session id for this device', async () => {
    const first = getSessionId();
    const second = await writeSession('user-sub', config.dynamoDB);

    expect(second).not.toBe(first);
    expect(getSessionId()).toBe(second);
    expect(AWS_DYNAMODB.writeSession).toHaveBeenLastCalledWith(
      'user-sub',
      second,
      'this-device',
      config.dynamoDB
    );
  });

  it('clears the session', () => {
    clearSession();
    expect(getSessionId()).toBeNull();
  });

  it('refreshes STS and validates the device on each heartbeat', async () => {
    const opts = makeOpts();
    startHeartbeat(opts);

    await tick();

    expect(AWS_STS.maybeRefresh).toHaveBeenCalled();
    expect(AWS_DYNAMODB.getSession).toHaveBeenCalledWith('user-sub', config.dynamoDB);
    expect(AWS_COGNITO.refreshTokens).not.toHaveBeenCalled();
    expect(opts.onInvalidated).not.toHaveBeenCalled();
  });

  it('logs the user out when another device signs in', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getSession').mockResolvedValue({
      sessionId: 's',
      deviceId: 'other-device',
    });
    const opts = makeOpts();
    startHeartbeat(opts);

    await tick();
    await tick();

    expect(opts.onInvalidated).toHaveBeenCalledTimes(1);
  });

  it('logs the user out when the session record is gone', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getSession').mockResolvedValue(null);
    const opts = makeOpts();
    startHeartbeat(opts);

    await tick();

    expect(opts.onInvalidated).toHaveBeenCalled();
  });

  it('refreshes Cognito tokens once they near expiry', async () => {
    const opts = makeOpts();
    startHeartbeat(opts);

    await vi.advanceTimersByTimeAsync(TOKEN_REFRESH_THRESHOLD_MS + HEARTBEAT_INTERVAL_MS);

    expect(AWS_COGNITO.refreshTokens).toHaveBeenCalledWith('refresh-token', config.cognito);
    expect(opts.setTokens).toHaveBeenCalledWith({
      accessToken: 'a2',
      idToken: 'i2',
      refreshToken: 'r',
    });
  });

  it('skips the refresh without a refresh token or fresh tokens', async () => {
    vi.spyOn(AWS_COGNITO, 'refreshTokens').mockResolvedValue(null);
    const withToken = makeOpts();
    startHeartbeat(withToken);
    await vi.advanceTimersByTimeAsync(TOKEN_REFRESH_THRESHOLD_MS + HEARTBEAT_INTERVAL_MS);
    expect(withToken.setTokens).not.toHaveBeenCalled();

    const withoutToken = makeOpts({ getRefreshToken: () => null });
    vi.mocked(AWS_COGNITO.refreshTokens).mockClear();
    startHeartbeat(withoutToken);
    await tick();
    expect(AWS_COGNITO.refreshTokens).not.toHaveBeenCalled();
  });

  it('logs out after repeated Cognito refresh failures', async () => {
    vi.spyOn(AWS_COGNITO, 'refreshTokens').mockRejectedValue(new Error('NotAuthorized'));
    const opts = makeOpts();
    startHeartbeat(opts);
    await vi.advanceTimersByTimeAsync(TOKEN_REFRESH_THRESHOLD_MS);

    for (let i = 1; i < MAX_REFRESH_FAILURES; i++) await tick();
    expect(opts.onInvalidated).not.toHaveBeenCalled();

    await tick();
    expect(opts.onInvalidated).toHaveBeenCalledTimes(1);
    expect(AWS_COGNITO.refreshTokens).toHaveBeenCalledTimes(MAX_REFRESH_FAILURES);
  });

  it('survives a failing heartbeat', async () => {
    vi.spyOn(AWS_STS, 'maybeRefresh').mockRejectedValue('sts down');
    const opts = makeOpts();
    startHeartbeat(opts);

    await tick();

    expect(Logger.error).toHaveBeenCalledWith('Session heartbeat error: sts down');
    expect(opts.onInvalidated).not.toHaveBeenCalled();
  });
});
