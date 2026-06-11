import path from 'path';
import { app, BrowserWindow, dialog, Menu, screen } from 'electron';

import { AWS_STS } from '../classes/aws/sts';
import { AWS_SECRETS } from '../classes/aws/secrets';
import { AWS_COGNITO } from '../classes/aws/cognito';
import { AWS_DYNAMODB } from '../classes/aws/dynamodb';
import { AWS_S3 } from '../classes/aws/s3';
import { AWS_SQS } from '../classes/aws/sqs';
import { AWS_TEXTRACT } from '../classes/aws/textract';
import { AWS_BEDROCK } from '../classes/aws/bedrock';
import { Neo4J } from '../classes/neo4j';
import { Qdrant } from '../classes/qdrant';
import { awsConfig, buildAppConfig } from './config';
import { registerAuthHandlers } from './handlers/auth';
import { registerConfigHandlers } from './handlers/config';
import { registerNavHandlers } from './handlers/nav';
import { registerProjectHandlers } from './handlers/projects';
import { registerDocumentHandlers } from './handlers/documents';
import { registerGraphHandlers } from './handlers/graph';
import { registerSearchHandlers } from './handlers/search';
import { registerUserHandlers } from './handlers/user';
import { DockerManager } from './services/docker-manager';
import { AppConfig } from '../interfaces/config';
import { CognitoAuthResult } from '../types/aws';
import { Logger } from '../utils/logger';

// Logger must be the first thing initialized so all subsequent module-scope
// code and IPC handler registrations can emit structured log output.
Logger.init();

Menu.setApplicationMenu(null);

let mainWindow: BrowserWindow | null = null;
let currentTokens: CognitoAuthResult | null = null;
let appConfig: AppConfig | null = null;
let isQuitting = false;

const dockerManager = new DockerManager();

function createWindow(): void {
  const iconPath = path.join(__dirname, '../../build/icon.png');
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const restoreW = Math.round((screenW * 5) / 6);
  const restoreH = Math.round((screenH * 5) / 6);

  mainWindow = new BrowserWindow({
    width: restoreW,
    height: restoreH,
    minWidth: 900,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();

  mainWindow.on('unmaximize', () => {
    if (!mainWindow) return;
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = Math.round((sw * 5) / 6);
    const h = Math.round((sh * 5) / 6);
    mainWindow.setSize(w, h);
    mainWindow.center();
  });

  mainWindow.loadFile(path.join(__dirname, '../../renderer/login/index.html'));
  Logger.debug('Browser window created — loaded login page');
}

// IPC handlers are registered at module scope so they are ready before
// app.whenReady fires. Closures keep references live as state changes.
registerAuthHandlers(
  () => mainWindow,
  () => appConfig,
  () => currentTokens,
  (tokens) => {
    currentTokens = tokens;
  }
);

registerConfigHandlers(() => appConfig);
registerNavHandlers(() => mainWindow);
registerProjectHandlers(
  () => appConfig,
  () => currentTokens
);
registerDocumentHandlers(
  () => appConfig,
  () => currentTokens
);
registerGraphHandlers(
  () => appConfig,
  () => currentTokens
);
registerSearchHandlers(
  () => appConfig,
  () => currentTokens
);
registerUserHandlers(
  () => appConfig,
  () => currentTokens
);

app.whenReady().then(async () => {
  Logger.info('Electron app ready — starting initialization sequence');

  try {
    Logger.info('Fetching application secrets with local credentials...');
    await AWS_SECRETS.init();

    Logger.info('Assuming IAM service role...');
    await AWS_STS.init(AWS_SECRETS.secrets.SVC_ROLE_ARN);

    appConfig = buildAppConfig(AWS_SECRETS.secrets);
    Logger.info('App config assembled from Secrets Manager values');

    AWS_COGNITO.init();
    AWS_DYNAMODB.init();
    AWS_S3.init();
    AWS_SQS.init();
    AWS_TEXTRACT.init();
    AWS_BEDROCK.init(appConfig.bedrock.modelId);
    Neo4J.init(appConfig.neo4j);
    await Qdrant.init(appConfig.qdrant);

    if (app.isPackaged) {
      await dockerManager.start();
    } else {
      Logger.info('Dev mode — skipping Docker management, assuming containers already running');
    }

    createWindow();
    Logger.info('Application startup complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`Startup failed: ${message}`);

    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application:\n\n${message}\n\nEnsure your AWS CLI is configured with access to Secrets Manager secret "${awsConfig.secretName}".`
    );
    app.quit();
  }
});

app.on('will-quit', (event) => {
  if (isQuitting) return;
  if (!app.isPackaged) return;

  event.preventDefault();
  isQuitting = true;

  Logger.info('App quitting — stopping Docker containers...');
  void Neo4J.close();
  dockerManager.stop().finally(() => {
    Logger.info('Shutdown complete');
    app.quit();
  });
});

app.on('window-all-closed', () => {
  Logger.info('All windows closed — quitting application');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
