import path from 'path';
import { app, BrowserWindow, dialog, Menu } from 'electron';

import { AWS_STS } from '../aws/sts';
import { AWS_SECRETS } from '../aws/secrets';
import { AWS_COGNITO } from '../aws/cognito';
import { AWS_DYNAMODB } from '../aws/dynamodb';
import { AWS_S3 } from '../aws/s3';
import { AWS_SQS } from '../aws/sqs';
import { AWS_TEXTRACT } from '../aws/textract';
import { AWS_BEDROCK } from '../aws/bedrock';
import { Neo4J } from '../aws/neo4j';
import { Qdrant } from '../aws/qdrant';
import { awsConfig, buildAppConfig } from './config';
import { registerAuthHandlers } from './handlers/auth';
import { registerConfigHandlers } from './handlers/config';
import { registerNavHandlers } from './handlers/nav';
import { registerProjectHandlers } from './handlers/projects';
import { registerDocumentHandlers } from './handlers/documents';
import { registerGraphHandlers } from './handlers/graph';
import { registerSearchHandlers } from './handlers/search';
import { AppConfig } from '../interfaces/app';
import { CognitoAuthResult } from '../types/aws';
import { Logger } from '../utils/logger';

// Logger must be the first thing initialized so all subsequent module-scope
// code and IPC handler registrations can emit structured log output.
Logger.init();

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

app.whenReady().then(async () => {
  Logger.info('Electron app ready — starting AWS initialization sequence');

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

app.on('window-all-closed', () => {
  Logger.info('All windows closed — quitting application');
  void Neo4J.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});