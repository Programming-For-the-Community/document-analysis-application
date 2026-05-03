import path from 'path';

import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider'

import { AWS_STS } from '../aws/sts'
import { AWS_SECRETS } from '../aws/secrets'
import { awsConfig, buildAppConfig, AppConfig } from './config'
import { RoleCredentials } from '../interfaces/aws'

Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null
let currentTokens: { accessToken: string; idToken: string; refreshToken: string } | null = null
let roleCredentials: RoleCredentials | null = null
let appConfig: AppConfig | null = null

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
  })

  mainWindow.loadFile(path.join(__dirname, '../../renderer/login.html'))
}

ipcMain.handle(
  'auth:start',
  async (_event, credentials: { username: string; password: string }) => {
    if (!roleCredentials || !appConfig) {
      return { success: false, error: 'App not ready — restart the app' }
    }

    const client = new CognitoIdentityProviderClient({
      region: awsConfig.region,
      credentials: roleCredentials,
    })

    try {
      const response = await client.send(
        new AdminInitiateAuthCommand({
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          UserPoolId: appConfig.cognito.userPoolId,
          ClientId: appConfig.cognito.clientId,
          AuthParameters: {
            USERNAME: credentials.username,
            PASSWORD: credentials.password,
          },
        }),
      )

      const result = response.AuthenticationResult
      if (!result?.AccessToken || !result.IdToken || !result.RefreshToken) {
        return { success: false, error: 'Incomplete authentication response from Cognito' }
      }

      currentTokens = {
        accessToken: result.AccessToken,
        idToken: result.IdToken,
        refreshToken: result.RefreshToken,
      }

      mainWindow?.loadFile(path.join(__dirname, '../../renderer/home.html'))
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      return { success: false, error: message }
    }
  },
)

ipcMain.handle(
  'auth:signup',
  async (_event, credentials: { username: string; password: string }) => {
    if (!roleCredentials || !appConfig) {
      return { success: false, error: 'App not ready — restart the app' }
    }

    const client = new CognitoIdentityProviderClient({
      region: awsConfig.region,
      credentials: roleCredentials,
    })

    try {
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: appConfig.cognito.userPoolId,
          Username: credentials.username,
          TemporaryPassword: credentials.password,
          MessageAction: 'SUPPRESS',
        }),
      )

      await client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: appConfig.cognito.userPoolId,
          Username: credentials.username,
          Password: credentials.password,
          Permanent: true,
        }),
      )

      const authResponse = await client.send(
        new AdminInitiateAuthCommand({
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          UserPoolId: appConfig.cognito.userPoolId,
          ClientId: appConfig.cognito.clientId,
          AuthParameters: {
            USERNAME: credentials.username,
            PASSWORD: credentials.password,
          },
        }),
      )

      const result = authResponse.AuthenticationResult
      if (!result?.AccessToken || !result.IdToken || !result.RefreshToken) {
        return { success: false, error: 'Account created but login failed — try signing in' }
      }

      currentTokens = {
        accessToken: result.AccessToken,
        idToken: result.IdToken,
        refreshToken: result.RefreshToken,
      }

      mainWindow?.loadFile(path.join(__dirname, '../../renderer/home.html'))
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account'
      return { success: false, error: message }
    }
  },
)

ipcMain.handle('auth:get-tokens', () => currentTokens)

ipcMain.handle('auth:logout', () => {
  currentTokens = null
  mainWindow?.loadFile(path.join(__dirname, '../../renderer/login.html'))
})

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
}))

app.whenReady().then(async () => {
  try {
    roleCredentials = await AWS_STS.getCredentials()
    await AWS_SECRETS.init(awsConfig.region, roleCredentials)
    await AWS_SECRETS.loadSecrets(awsConfig.secretName)
    appConfig = buildAppConfig(AWS_SECRETS.getSecrets())
    createWindow()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application:\n\n${message}\n\nEnsure your AWS CLI is configured and ${awsConfig.roleArn || 'the configured role'} is accessible.`,
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
