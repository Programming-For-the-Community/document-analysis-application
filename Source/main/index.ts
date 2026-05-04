import path from 'path';
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';

import { AWS_STS } from '../aws/sts';
import { AWS_SECRETS } from '../aws/secrets';
import { AWS_COGNITO } from '../aws/cognito';
import { awsConfig, buildAppConfig } from './config';
import { AppConfig } from '../interfaces/app';
import { CognitoAuthResult } from '../types/aws';

Menu.setApplicationMenu(null);

let mainWindow: BrowserWindow | null = null;
let currentTokens: CognitoAuthResult | null = null;
let appConfig: AppConfig | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../renderer/login.html'));
}

ipcMain.handle(
  'auth:start',
  async (_event, credentials: { username: string; password: string }) => {
    if (!AWS_STS.credentials || !appConfig) {
      return { success: false, error: 'App not ready — restart the app' };
    }

    try {
      currentTokens = await AWS_COGNITO.authenticate(
        credentials.username,
        credentials.password,
        appConfig.cognito
      );

      if (!currentTokens || typeof currentTokens === 'boolean') {
        return { success: false, error: 'Incomplete authentication response from Cognito' };
      }

      mainWindow?.loadFile(path.join(__dirname, '../../renderer/home.html'));
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      return { success: false, error: message };
    }
  }
);

ipcMain.handle(
  'auth:signup',
  async (_event, credentials: { username: string; password: string }) => {
    if (!AWS_STS.credentials || !appConfig) {
      return { success: false, error: 'App not ready — restart the app' };
    }

    try {
      currentTokens = await AWS_COGNITO.register(
        credentials.username,
        credentials.password,
        appConfig.cognito
      );

      if (!currentTokens || typeof currentTokens === 'boolean') {
        return { success: false, error: 'Account created but login failed — try signing in' };
      }

      mainWindow?.loadFile(path.join(__dirname, '../../renderer/home.html'));
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      return { success: false, error: message };
    }
  }
);

ipcMain.handle('auth:get-tokens', () => currentTokens);

ipcMain.handle('auth:logout', () => {
  currentTokens = null;
  mainWindow?.loadFile(path.join(__dirname, '../../renderer/login.html'));
});

ipcMain.handle('config:get', () => ({
  region: awsConfig.region,
  roleArn: awsConfig.roleArn,
  s3Bucket: appConfig?.s3.documentBucket,
  dynamoProjectStateTable: appConfig?.dynamoDB.projectStateTable,
  dynamoProjectAccessTable: appConfig?.dynamoDB.projectAccessTable,
  sqsQueueUrl: appConfig?.sqs.queueUrl,
  snsTopicArn: appConfig?.sns.topicArn,
  neo4jUri: appConfig?.neo4j.uri,
  neo4jPassword: appConfig?.neo4j.password,
  qdrantUrl: appConfig?.qdrant.url,
  qdrantApiKey: appConfig?.qdrant.apiKey,
}));

app.whenReady().then(async () => {
  try {
    await AWS_STS.init();
    await AWS_SECRETS.init();
    appConfig = buildAppConfig(AWS_SECRETS.secrets);
    AWS_COGNITO.init();
    createWindow();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application:\n\n${message}\n\nEnsure your AWS CLI is configured and ${awsConfig.roleArn || 'the configured role'} is accessible.`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
