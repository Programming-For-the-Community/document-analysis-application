import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAuthHandlers } from '../../../main/handlers/auth';
import * as session from '../../../main/services/session';
import * as sqsPoller from '../../../main/services/sqs-poller';
import * as projectPoller from '../../../main/services/project-poller';
import * as storeResync from '../../../main/services/store-resync';
import * as updater from '../../../main/services/updater';
import { AWS_STS } from '../../../classes/aws/sts';
import { AWS_COGNITO } from '../../../classes/aws/cognito';
import { CognitoAuthResult } from '../../../types/aws';
import { HeartbeatOptions } from '../../../interfaces/services/session';
import { RoleCredentials } from '../../../interfaces/aws';
import { makeConfig, makeTokens } from '../../helpers';
import { invoke, mainWindow } from '../../mocks/electron';

vi.mock('../../../main/services/session', () => ({
  writeSession: vi.fn(),
  startHeartbeat: vi.fn(),
  stopHeartbeat: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock('../../../main/services/sqs-poller', () => ({ startPoller: vi.fn(), stopPoller: vi.fn() }));
vi.mock('../../../main/services/project-poller', () => ({
  startProjectPoller: vi.fn(),
  stopProjectPoller: vi.fn(),
}));
vi.mock('../../../main/services/store-resync', () => ({
  startStoreResync: vi.fn(),
  stopStoreResync: vi.fn(),
}));
vi.mock('../../../main/services/updater', () => ({ checkForUpdate: vi.fn() }));

const config = makeConfig();
const credentials = { username: 'alice', password: 'pw' };
const loginPage = expect.stringContaining(path.join('renderer', 'login', 'index.html'));
const homePage = expect.stringContaining(path.join('renderer', 'home', 'index.html'));

describe('auth handlers', () => {
  let tokens: CognitoAuthResult | null;
  let appConfig: typeof config | null;

  beforeEach(() => {
    tokens = null;
    appConfig = config;
    vi.spyOn(AWS_STS, 'credentials', 'get').mockReturnValue({
      accessKeyId: 'AKIA',
    } as RoleCredentials);
    vi.spyOn(AWS_STS, 'setSourceIdentity').mockResolvedValue();
    vi.mocked(session.writeSession).mockResolvedValue('session-id');
    vi.mocked(updater.checkForUpdate).mockResolvedValue();
    registerAuthHandlers(
      () => mainWindow as never,
      () => appConfig,
      () => tokens,
      (t) => {
        tokens = t;
      }
    );
  });

  function expectLoggedIn() {
    expect(tokens).toEqual(makeTokens('user-sub'));
    expect(AWS_STS.setSourceIdentity).toHaveBeenCalledWith('user-sub');
    expect(session.writeSession).toHaveBeenCalledWith('user-sub', config.dynamoDB);
    expect(sqsPoller.startPoller).toHaveBeenCalledWith('user-sub', config);
    expect(projectPoller.startProjectPoller).toHaveBeenCalledWith('user-sub', config);
    expect(storeResync.startStoreResync).toHaveBeenCalledWith('user-sub', config);
    expect(session.startHeartbeat).toHaveBeenCalled();
    expect(updater.checkForUpdate).toHaveBeenCalledWith(config);
    expect(mainWindow.loadFile).toHaveBeenCalledWith(homePage);
  }

  describe('auth:start', () => {
    it('signs in and starts the per-user services', async () => {
      vi.spyOn(AWS_COGNITO, 'authenticate').mockResolvedValue(makeTokens('user-sub'));

      await expect(invoke('auth:start', credentials)).resolves.toEqual({ success: true });

      expect(AWS_COGNITO.authenticate).toHaveBeenCalledWith('alice', 'pw', config.cognito);
      expectLoggedIn();
    });

    it('rejects incomplete Cognito responses', async () => {
      vi.spyOn(AWS_COGNITO, 'authenticate').mockResolvedValue(false);
      await expect(invoke('auth:start', credentials)).resolves.toEqual({
        success: false,
        error: 'Incomplete authentication response from Cognito',
      });
    });

    it('returns the Cognito error', async () => {
      vi.spyOn(AWS_COGNITO, 'authenticate').mockRejectedValue(
        new Error('Incorrect username or password.')
      );
      await expect(invoke('auth:start', credentials)).resolves.toEqual({
        success: false,
        error: 'Incorrect username or password.',
      });

      vi.spyOn(AWS_COGNITO, 'authenticate').mockRejectedValue('weird');
      await expect(invoke('auth:start', credentials)).resolves.toEqual({
        success: false,
        error: 'Authentication failed',
      });
    });
  });

  describe('auth:signup', () => {
    it('registers, signs in and starts the per-user services', async () => {
      vi.spyOn(AWS_COGNITO, 'register').mockResolvedValue(makeTokens('user-sub'));

      await expect(invoke('auth:signup', credentials)).resolves.toEqual({ success: true });

      expect(AWS_COGNITO.register).toHaveBeenCalledWith('alice', 'pw', config.cognito);
      expectLoggedIn();
    });

    it('reports an account created without a session', async () => {
      vi.spyOn(AWS_COGNITO, 'register').mockResolvedValue(false);
      await expect(invoke('auth:signup', credentials)).resolves.toEqual({
        success: false,
        error: 'Account created but login failed — try signing in',
      });
    });

    it('returns the Cognito error', async () => {
      vi.spyOn(AWS_COGNITO, 'register').mockRejectedValue(new Error('User already exists'));
      await expect(invoke('auth:signup', credentials)).resolves.toEqual({
        success: false,
        error: 'User already exists',
      });

      vi.spyOn(AWS_COGNITO, 'register').mockRejectedValue(42);
      await expect(invoke('auth:signup', credentials)).resolves.toEqual({
        success: false,
        error: 'Failed to create account',
      });
    });
  });

  it.each(['auth:start', 'auth:signup'])(
    '%s refuses before the app has initialized',
    async (channel) => {
      appConfig = null;
      await expect(invoke(channel, credentials)).resolves.toEqual({
        success: false,
        error: 'App not ready — restart the app',
      });

      appConfig = config;
      vi.spyOn(AWS_STS, 'credentials', 'get').mockReturnValue(
        undefined as unknown as RoleCredentials
      );
      await expect(invoke(channel, credentials)).resolves.toMatchObject({ success: false });
    }
  );

  it('returns tokens only for a signed-in user', async () => {
    await expect(invoke('auth:get-tokens')).resolves.toBeNull();
    tokens = false;
    await expect(invoke('auth:get-tokens')).resolves.toBeNull();
    tokens = makeTokens();
    await expect(invoke('auth:get-tokens')).resolves.toEqual(makeTokens());
  });

  it('logs out, stopping every per-user service', async () => {
    tokens = makeTokens();

    await invoke('auth:logout');

    expect(sqsPoller.stopPoller).toHaveBeenCalled();
    expect(projectPoller.stopProjectPoller).toHaveBeenCalled();
    expect(storeResync.stopStoreResync).toHaveBeenCalled();
    expect(session.stopHeartbeat).toHaveBeenCalled();
    expect(session.clearSession).toHaveBeenCalled();
    expect(AWS_STS.setSourceIdentity).toHaveBeenCalledWith(null);
    expect(tokens).toBeNull();
    expect(mainWindow.loadFile).toHaveBeenCalledWith(loginPage);
  });

  describe('heartbeat callbacks', () => {
    async function signIn(): Promise<HeartbeatOptions> {
      vi.spyOn(AWS_COGNITO, 'authenticate').mockResolvedValue(makeTokens('user-sub'));
      await invoke('auth:start', credentials);
      return vi.mocked(session.startHeartbeat).mock.calls[0]![0];
    }

    it('reads and replaces the token set', async () => {
      const opts = await signIn();
      expect(opts.getRefreshToken()).toBe('refresh-token');

      const fresh = { accessToken: 'a2', idToken: 'i2', refreshToken: 'r2' };
      opts.setTokens(fresh);
      expect(tokens).toBe(fresh);

      tokens = null;
      expect(opts.getRefreshToken()).toBeNull();
    });

    it('logs the user out when the session is invalidated elsewhere', async () => {
      const opts = await signIn();

      opts.onInvalidated();

      expect(sqsPoller.stopPoller).toHaveBeenCalled();
      expect(storeResync.stopStoreResync).toHaveBeenCalled();
      expect(session.clearSession).toHaveBeenCalled();
      expect(tokens).toBeNull();
      expect(AWS_STS.setSourceIdentity).toHaveBeenLastCalledWith(null);
      expect(mainWindow.loadFile).toHaveBeenLastCalledWith(loginPage);
    });
  });
});
