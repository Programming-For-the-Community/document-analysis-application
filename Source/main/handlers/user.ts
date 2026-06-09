import { ipcMain } from 'electron';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AppConfig } from '../../interfaces/config';
import { CognitoAuthResult } from '../../types/aws';
import { Logger } from '../../utils/logger';

function extractSub(idToken: string): string {
  const base64 = idToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8')) as Record<
    string,
    unknown
  >;
  const sub = payload['sub'];
  if (typeof sub !== 'string' || !sub) throw new Error('ID token missing sub claim');
  return sub;
}

export function registerUserHandlers(
  getAppConfig: () => AppConfig | null,
  getTokens: () => CognitoAuthResult | null
): void {
  ipcMain.handle(
    'user:get-preference',
    async (
      _event,
      key: string
    ): Promise<{ success: boolean; value?: string | null; error?: string }> => {
      const config = getAppConfig();
      const tokens = getTokens();
      if (!config || !tokens || typeof tokens === 'boolean')
        return { success: false, error: 'App not ready' };
      try {
        const userSub = extractSub(tokens.idToken);
        const value = await AWS_DYNAMODB.getUserPreference(userSub, key, config.dynamoDB);
        return { success: true, value };
      } catch (err) {
        Logger.error(
          `user:get-preference error: ${err instanceof Error ? err.message : String(err)}`
        );
        return { success: false, error: 'Failed to get preference' };
      }
    }
  );

  ipcMain.handle(
    'user:set-preference',
    async (_event, key: string, value: string): Promise<{ success: boolean; error?: string }> => {
      const config = getAppConfig();
      const tokens = getTokens();
      if (!config || !tokens || typeof tokens === 'boolean')
        return { success: false, error: 'App not ready' };
      try {
        const userSub = extractSub(tokens.idToken);
        await AWS_DYNAMODB.setUserPreference(userSub, key, value, config.dynamoDB);
        return { success: true };
      } catch (err) {
        Logger.error(
          `user:set-preference error: ${err instanceof Error ? err.message : String(err)}`
        );
        return { success: false, error: 'Failed to save preference' };
      }
    }
  );
}
