import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';

import { AWS_STS } from '../../aws/sts';
import { AWS_COGNITO } from '../../aws/cognito';
import { AppConfig } from '../../interfaces/config';
import { CognitoAuthResult } from '../../types/aws';
import { CognitoCredentials } from '../../interfaces/aws';
import { extractSub } from '../../utils/jwt';
import {
  writeSession,
  startHeartbeat,
  stopHeartbeat,
  clearSession,
  HeartbeatOptions,
} from '../services/session';
import { startPoller, stopPoller } from '../services/sqs-poller';
import { startProjectPoller, stopProjectPoller } from '../services/project-poller';
import { syncNeo4jForUser } from '../services/neo4j-sync';
import { syncQdrantForUser } from '../services/qdrant-sync';
import { Logger } from '../../utils/logger';

async function onLoginSuccess(
  tokens: CognitoCredentials,
  config: AppConfig,
  getTokens: () => CognitoAuthResult | null,
  setTokens: (t: CognitoAuthResult | null) => void,
  win: BrowserWindow | null
): Promise<void> {
  setTokens(tokens);

  const userSub = extractSub(tokens.idToken);
  await writeSession(userSub, config.dynamoDB);

  startPoller(userSub, config);
  startProjectPoller(userSub, config);
  void syncNeo4jForUser(userSub, config);
  void syncQdrantForUser(userSub, config);

  const heartbeatOpts: HeartbeatOptions = {
    userSub,
    dbConfig: config.dynamoDB,
    cognitoConfig: config.cognito,
    getRefreshToken: () => {
      const t = getTokens();
      return t && typeof t !== 'boolean' ? t.refreshToken : null;
    },
    setTokens: (fresh) => setTokens(fresh),
    onInvalidated: () => {
      Logger.warn('Session invalidated — logging out');
      stopPoller();
      clearSession();
      setTokens(null);
      win?.loadFile(path.join(__dirname, '../../../renderer/login/index.html'));
    },
  };
  startHeartbeat(heartbeatOpts);
}

function onLogout(
  setTokens: (t: CognitoAuthResult | null) => void,
  win: BrowserWindow | null
): void {
  stopPoller();
  stopProjectPoller();
  stopHeartbeat();
  clearSession();
  setTokens(null);
  win?.loadFile(path.join(__dirname, '../../../renderer/login/index.html'));
}

export function registerAuthHandlers(
  getWindow: () => BrowserWindow | null,
  getAppConfig: () => AppConfig | null,
  getTokens: () => CognitoAuthResult | null,
  setTokens: (tokens: CognitoAuthResult | null) => void
): void {
  ipcMain.handle(
    'auth:start',
    async (_event, credentials: { username: string; password: string }) => {
      Logger.info(`Sign-in attempt for user: "${credentials.username}"`);

      if (!AWS_STS.credentials || !getAppConfig()) {
        Logger.error('Sign-in failed — app not fully initialized');
        return { success: false, error: 'App not ready — restart the app' };
      }

      try {
        const tokens = await AWS_COGNITO.authenticate(
          credentials.username,
          credentials.password,
          getAppConfig()!.cognito
        );

        if (!tokens || typeof tokens === 'boolean') {
          Logger.warn(`Sign-in for "${credentials.username}" returned incomplete tokens`);
          return { success: false, error: 'Incomplete authentication response from Cognito' };
        }

        await onLoginSuccess(tokens, getAppConfig()!, getTokens, setTokens, getWindow());
        Logger.info(`User "${credentials.username}" signed in — navigating to home`);
        getWindow()?.loadFile(path.join(__dirname, '../../../renderer/home/index.html'));
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        Logger.error(`Sign-in error for "${credentials.username}": ${message}`);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'auth:signup',
    async (_event, credentials: { username: string; password: string }) => {
      Logger.info(`Sign-up attempt for user: "${credentials.username}"`);

      if (!AWS_STS.credentials || !getAppConfig()) {
        Logger.error('Sign-up failed — app not fully initialized');
        return { success: false, error: 'App not ready — restart the app' };
      }

      try {
        const tokens = await AWS_COGNITO.register(
          credentials.username,
          credentials.password,
          getAppConfig()!.cognito
        );

        if (!tokens || typeof tokens === 'boolean') {
          Logger.warn(
            `Sign-up for "${credentials.username}" succeeded but sign-in returned incomplete tokens`
          );
          return { success: false, error: 'Account created but login failed — try signing in' };
        }

        await onLoginSuccess(tokens, getAppConfig()!, getTokens, setTokens, getWindow());
        Logger.info(`User "${credentials.username}" registered and signed in — navigating to home`);
        getWindow()?.loadFile(path.join(__dirname, '../../../renderer/home/index.html'));
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create account';
        Logger.error(`Sign-up error for "${credentials.username}": ${message}`);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('auth:get-tokens', () => {
    Logger.debug('IPC auth:get-tokens requested');
    return getTokens();
  });

  ipcMain.handle('auth:logout', () => {
    Logger.info('User signed out');
    onLogout(setTokens, getWindow());
  });
}
