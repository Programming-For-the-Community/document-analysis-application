import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';

import { AWS_STS } from '../../aws/sts';
import { AWS_COGNITO } from '../../aws/cognito';
import { AppConfig } from '../../interfaces/app';
import { CognitoAuthResult } from '../../types/aws';
import { Logger } from '../../utils/logger';

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
          return {
            success: false,
            error: 'Incomplete authentication response from Cognito',
          };
        }

        setTokens(tokens);
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
          Logger.warn(`Sign-up for "${credentials.username}" succeeded but sign-in returned incomplete tokens`);
          return {
            success: false,
            error: 'Account created but login failed — try signing in',
          };
        }

        setTokens(tokens);
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
    Logger.info('User signed out — clearing tokens and returning to login');
    setTokens(null);
    getWindow()?.loadFile(path.join(__dirname, '../../../renderer/login/index.html'));
  });
}