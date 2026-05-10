import path from 'path';
import dotenv from 'dotenv';

import { AppConfig } from '../interfaces/app';
import { DBConnectionsConfig } from '../interfaces/db';
import { AWSConfig, SecretValues } from '../interfaces/aws';

dotenv.config({ path: process.env['NODE_ENV'] ?? path.join(__dirname, '../../.env') });

export const awsConfig: AWSConfig = {
  region: process.env['AWS_REGION'] || '',
  roleArn: process.env['AWS_ROLE_ARN'] || '',
  secretName: process.env['AWS_SECRET_NAME'] || '',
};

export const databaseCxnsConfig: DBConnectionsConfig = {
  neo4jUri: process.env['NEO4J_URI'] || '',
  qdrantUrl: process.env['QDRANT_URL'] || '',
};



export function buildAppConfig(secrets: SecretValues): AppConfig {
  return {
    dynamoDB: {
      projectStateTable: secrets.DYNAMODB_PROJECT_STATE_TABLE,
      projectAccessTable: secrets.DYNAMODB_PROJECT_ACCESS_TABLE,
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
      uri: process.env['NEO4J_URI'] || '',
      user: 'neo4j',
      password: secrets.NEO4J_PASSWORD,
    },
    qdrant: {
      url: process.env['QDRANT_URL'] || '',
      apiKey: secrets.QDRANT_API_KEY,
    },
  };
}
