export interface AWSConfig {
  region: string;
  roleArn: string;
  secretName: string;
}

export interface RoleCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | undefined;
  expiresAt: Date;
}

export interface CognitoCredentials {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface SecretValues {
  COGNITO_USER_POOL_ID: string;
  COGNITO_CLIENT_ID: string;
  S3_BUCKET: string;
  DYNAMODB_PROJECT_STATE_TABLE: string;
  DYNAMODB_PROJECT_ACCESS_TABLE: string;
  SQS_QUEUE_URL: string;
  SNS_TOPIC_ARN: string;
  BEDROCK_MODEL_ID: string;
  QDRANT_API_KEY: string;
  SVC_PWD: string;
}
