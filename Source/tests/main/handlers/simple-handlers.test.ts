// The thin IPC modules: config, connectivity, nav, update and user preferences.
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { registerConfigHandlers } from '../../../main/handlers/config';
import { registerConnectivityHandlers } from '../../../main/handlers/connectivity';
import { registerNavHandlers } from '../../../main/handlers/nav';
import { registerUpdateHandlers } from '../../../main/handlers/update';
import { registerUserHandlers } from '../../../main/handlers/user';
import * as updater from '../../../main/services/updater';
import { AWS_SECRETS } from '../../../classes/aws/secrets';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { SecretValues } from '../../../interfaces/aws';
import { awsConfig } from '../../../main/config';
import { makeConfig, makeIdToken, makeTokens } from '../../helpers';
import { invoke, mainWindow } from '../../mocks/electron';

vi.mock('../../../main/services/updater', () => ({
  getUpdateState: vi.fn(),
  installUpdate: vi.fn(),
}));

const config = makeConfig();

describe('config:get', () => {
  it('returns the loaded configuration', async () => {
    vi.spyOn(AWS_SECRETS, 'secrets', 'get').mockReturnValue({
      SVC_ROLE_ARN: 'arn:role',
    } as SecretValues);
    registerConfigHandlers(() => config);

    await expect(invoke('config:get')).resolves.toMatchObject({
      region: awsConfig.region,
      roleArn: 'arn:role',
      s3Bucket: 'doc-bucket',
      sqsQueueUrl: 'https://sqs/queue',
      neo4jUri: 'bolt://localhost:7687',
      qdrantUrl: 'http://localhost:6333',
    });
  });

  it('works before configuration has loaded', async () => {
    vi.spyOn(AWS_SECRETS, 'secrets', 'get').mockReturnValue(undefined as unknown as SecretValues);
    registerConfigHandlers(() => null);

    await expect(invoke('config:get')).resolves.toMatchObject({
      roleArn: undefined,
      s3Bucket: undefined,
    });
  });
});

describe('connectivity:get', () => {
  it('returns the current connection status', async () => {
    registerConnectivityHandlers();
    await expect(invoke('connectivity:get')).resolves.toEqual({
      neo4j: expect.any(String),
      qdrant: expect.any(String),
    });
  });
});

describe('navigation', () => {
  it('opens a project page and returns home', async () => {
    registerNavHandlers(() => mainWindow as never);

    await invoke('nav:open-project', { id: 'p1', name: 'Project One' });
    await invoke('nav:go-home');

    expect(mainWindow.loadFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(path.join('renderer', 'project', 'index.html')),
      {
        query: { id: 'p1', name: 'Project One' },
      }
    );
    expect(mainWindow.loadFile).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(path.join('renderer', 'home', 'index.html'))
    );
  });

  it('does nothing without a window', async () => {
    registerNavHandlers(() => null);
    await expect(invoke('nav:go-home')).resolves.toBeUndefined();
  });
});

describe('updates', () => {
  it('exposes the update state and starts an install', async () => {
    vi.mocked(updater.getUpdateState).mockReturnValue({ status: 'available', version: '2.0.0' });
    registerUpdateHandlers();

    await expect(invoke('update:get-status')).resolves.toEqual({
      status: 'available',
      version: '2.0.0',
    });
    await invoke('update:install');
    expect(updater.installUpdate).toHaveBeenCalled();
  });
});

describe('user preferences', () => {
  it('reads and writes preferences for the signed-in user', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getUserPreference').mockResolvedValue('parchment');
    vi.spyOn(AWS_DYNAMODB, 'setUserPreference').mockResolvedValue();
    registerUserHandlers(
      () => config,
      () => makeTokens('sub-1')
    );

    await expect(invoke('user:get-preference', 'theme')).resolves.toEqual({
      success: true,
      value: 'parchment',
    });
    await expect(invoke('user:set-preference', 'theme', 'slate')).resolves.toEqual({
      success: true,
    });

    expect(AWS_DYNAMODB.getUserPreference).toHaveBeenCalledWith('sub-1', 'theme', config.dynamoDB);
    expect(AWS_DYNAMODB.setUserPreference).toHaveBeenCalledWith(
      'sub-1',
      'theme',
      'slate',
      config.dynamoDB
    );
  });

  it.each([
    ['no config', () => null, () => makeTokens()],
    ['no tokens', () => config, () => null],
    ['a failed login', () => config, () => false],
  ])('is unavailable with %s', async (_label, getConfig, getTokens) => {
    registerUserHandlers(getConfig, getTokens);
    await expect(invoke('user:get-preference', 'theme')).resolves.toEqual({
      success: false,
      error: 'App not ready',
    });
    await expect(invoke('user:set-preference', 'theme', 'x')).resolves.toEqual({
      success: false,
      error: 'App not ready',
    });
  });

  it('hides storage and token errors behind a generic message', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getUserPreference').mockRejectedValue(new Error('AccessDenied'));
    vi.spyOn(AWS_DYNAMODB, 'setUserPreference').mockRejectedValue('throttled');
    registerUserHandlers(
      () => config,
      () => makeTokens()
    );

    await expect(invoke('user:get-preference', 'theme')).resolves.toEqual({
      success: false,
      error: 'Failed to get preference',
    });
    await expect(invoke('user:set-preference', 'theme', 'x')).resolves.toEqual({
      success: false,
      error: 'Failed to save preference',
    });

    const noSub = { ...makeTokens(), idToken: makeIdToken({ email: 'x' }) };
    registerUserHandlers(
      () => config,
      () => noSub
    );
    await expect(invoke('user:get-preference', 'theme')).resolves.toMatchObject({ success: false });
  });
});
