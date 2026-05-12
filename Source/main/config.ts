import path from 'path';
import dotenv from 'dotenv';

import { AppConfig } from '../interfaces/app';
import { AWSConfig, SecretValues } from '../interfaces/aws';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// Bootstrap values needed to reach Secrets Manager — must live in .env
export const awsConfig: AWSConfig = {
  region: process.env['AWS_REGION'] || '',
  secretName: process.env['AWS_SECRET_NAME'] || '',
};

export function buildAppConfig(secrets: SecretValues): AppConfig {
  return {
    dynamoDB: {
      projectStateTable: secrets.DYNAMODB_PROJECT_STATE_TABLE,
      projectAccessTable: secrets.DYNAMODB_PROJECT_ACCESS_TABLE,
      userSessionsTable: secrets.DYNAMODB_USER_SESSIONS_TABLE,
    },
    cognito: {
      userPoolId: secrets.COGNITO_USER_POOL_ID,
      clientId: secrets.COGNITO_CLIENT_ID,
    },
    s3: {
      documentBucket: secrets.S3_BUCKET,
    },
    sns: {
      topicArn: secrets.SNS_TOPIC_ARN,
    },
    sqs: {
      queueUrl: secrets.SQS_QUEUE_URL,
    },
    bedrock: {
      modelId: secrets.BEDROCK_MODEL_ID,
    },
    neo4j: {
      uri: secrets.NEO4J_URI,
      user: 'neo4j',
      password: secrets.SVC_PWD,
    },
    qdrant: {
      url: secrets.QDRANT_URL,
      apiKey: secrets.QDRANT_KEY,
    },
  };
}
