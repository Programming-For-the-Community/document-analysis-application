import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import dotenv from 'dotenv'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider'

dotenv.config({ path: path.join(__dirname, '../../.env.dev') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

interface RoleCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string | undefined
}

interface AppConfig {
  cognitoUserPoolId: string
  cognitoClientId: string
  s3Bucket: string
  dynamoProjectStateTable: string
  dynamoProjectAccessTable: string
  sqsQueueUrl: string
  snsTopicArn: string
  neo4jPassword: string
  qdrantApiKey: string
}

let mainWindow: BrowserWindow | null = null
let roleCredentials: RoleCredentials | null = null
let appConfig: AppConfig | null = null
let currentTokens: { accessToken: string; idToken: string; refreshToken: string } | null = null

async function assumeServiceRole(): Promise<void> {
  const roleArn = process.env['AWS_ROLE_ARN']
  if (!roleArn) throw new Error('AWS_ROLE_ARN is not set in .env.dev')

  const sts = new STSClient({ region: process.env['AWS_REGION'] })
  const response = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'doc-analysis-electron',
      DurationSeconds: 3600,
    }),
  )

  const creds = response.Credentials
  if (!creds?.AccessKeyId || !creds.SecretAccessKey) {
    throw new Error('STS returned incomplete credentials')
  }

  roleCredentials = {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
  }
}

async function fetchAppConfig(): Promise<void> {
  const secretName = process.env['AWS_SECRET_NAME'] ?? 'doc-analysis-secret'

  const client = new SecretsManagerClient({
    region: process.env['AWS_REGION'],
    credentials: roleCredentials!,
  })

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }))
  if (!response.SecretString) throw new Error(`Secret "${secretName}" has no string value`)

  const s = JSON.parse(response.SecretString) as Record<string, string>

  appConfig = {
    cognitoUserPoolId: s['COGNITO_USER_POOL_ID'] ?? '',
    cognitoClientId: s['COGNITO_CLIENT_ID'] ?? '',
    s3Bucket: s['S3_BUCKET'] ?? '',
    dynamoProjectStateTable: s['DYNAMODB_PROJECT_STATE_TABLE'] ?? '',
    dynamoProjectAccessTable: s['DYNAMODB_PROJECT_ACCESS_TABLE'] ?? '',
    sqsQueueUrl: s['SQS_QUEUE_URL'] ?? '',
    snsTopicArn: s['SNS_TOPIC_ARN'] ?? '',
    neo4jPassword: s['SVC_PWD'] ?? '',
    qdrantApiKey: s['QDRANT_KEY'] ?? '',
  }
}

export function getAwsCredentials(): RoleCredentials {
  if (!roleCredentials) throw new Error('Service role not assumed — restart the app')
  return roleCredentials
}

export function getAppConfig(): AppConfig {
  if (!appConfig) throw new Error('App config not loaded — restart the app')
  return appConfig
}

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
      region: process.env['AWS_REGION'],
      credentials: roleCredentials,
    })

    try {
      const response = await client.send(
        new AdminInitiateAuthCommand({
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          UserPoolId: appConfig.cognitoUserPoolId,
          ClientId: appConfig.cognitoClientId,
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
      region: process.env['AWS_REGION'],
      credentials: roleCredentials,
    })

    try {
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: appConfig.cognitoUserPoolId,
          Username: credentials.username,
          TemporaryPassword: credentials.password,
          MessageAction: 'SUPPRESS',
        }),
      )

      await client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: appConfig.cognitoUserPoolId,
          Username: credentials.username,
          Password: credentials.password,
          Permanent: true,
        }),
      )

      const authResponse = await client.send(
        new AdminInitiateAuthCommand({
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          UserPoolId: appConfig.cognitoUserPoolId,
          ClientId: appConfig.cognitoClientId,
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
  region: process.env['AWS_REGION'],
  roleArn: process.env['AWS_ROLE_ARN'],
  s3Bucket: appConfig?.s3Bucket,
  dynamoProjectStateTable: appConfig?.dynamoProjectStateTable,
  dynamoProjectAccessTable: appConfig?.dynamoProjectAccessTable,
  sqsQueueUrl: appConfig?.sqsQueueUrl,
  snsTopicArn: appConfig?.snsTopicArn,
  neo4jUri: process.env['NEO4J_URI'],
  neo4jPassword: appConfig?.neo4jPassword,
  qdrantUrl: process.env['QDRANT_URL'],
  qdrantApiKey: appConfig?.qdrantApiKey,
}))

app.whenReady().then(async () => {
  try {
    await assumeServiceRole()
    await fetchAppConfig()
    createWindow()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application:\n\n${message}\n\nEnsure your AWS CLI is configured and ${process.env['AWS_ROLE_ARN'] ?? 'the configured role'} is accessible.`,
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
